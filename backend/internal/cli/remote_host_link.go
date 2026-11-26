package cli

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/spf13/cobra"
)

// errRemoteHostSignInUnavailable: the WorkOS device sign-in this command used
// was removed, and the LDAP sign-in replacing it is not connected yet.
var errRemoteHostSignInUnavailable = errors.New("signing in to Orchestrator Cloud is not available yet: WorkOS sign-in was removed and LDAP sign-in is not connected; set AO_LDAP_URL once it is")

// remoteHostSignIn signs the user in to their AO account for this one
// registration. It is a variable so tests can fake the account; the LDAP
// sign-in will replace the default.
var remoteHostSignIn = func(ctx context.Context, out io.Writer) (accountSession, error) {
	return accountSession{}, errRemoteHostSignInUnavailable
}

// remoteHostLinkLabelMaxBytes matches AO Cloud's limit on host labels.
const remoteHostLinkLabelMaxBytes = 64

type remoteHostAccountToken struct {
	HostID  string `json:"hostId"`
	Token   string `json:"token"`
	HostKey string `json:"hostKey"`
}

type accountHostDirectory struct {
	Hosts []struct {
		HostID string `json:"hostId"`
		Label  string `json:"label"`
		Token  string `json:"token"`
	} `json:"hosts"`
	FixedAddresses bool `json:"fixedAddresses"`
	HostKeys       bool `json:"hostKeys"`
}

// errTunnelNotReady means the wait ran out before the daemon reported an
// address; the tunnel may still come up.
var errTunnelNotReady = errors.New("the tunnel address is not ready; run `ao remote-host status`")

// accountSession is the signed-in AO account a link registers the machine to.
type accountSession struct {
	AccessToken string
	User        struct {
		ID    string
		Email string
	}
}

// newRemoteHostLinkCommand links a machine with no desktop app, such as a VM,
// to an AO account the way a signed-in desktop links itself: the user signs in,
// and the machine then appears on all of the account's desktops and phones. The account session is used for this one
// registration and never stored; from then on the machine speaks to AO Cloud
// with its own credential.
func newRemoteHostLinkCommand(ctx *commandContext) *cobra.Command {
	var label string
	var noQR bool
	cmd := &cobra.Command{
		Use:   "link",
		Short: "Link this machine to your Orchestrator account",
		Long: "Link this machine to your Orchestrator account.\n\n" +
			"After you sign in, this machine appears on every desktop and phone signed in to that\n" +
			"account, with no address or password to copy. Remote access is turned on if it is off.\n\n" +
			"Sign-in is not available yet: WorkOS sign-in was removed and LDAP sign-in is not connected.",
		Args: noArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return ctx.runRemoteHostLink(cmd.Context(), cmd.OutOrStdout(), label)
		},
	}
	cmd.Flags().StringVar(&label, "label", "", "Name shown on your devices (default: the name your account has for it, else the hostname)")
	// Kept so existing scripts keep working; there is no sign-in link to draw.
	cmd.Flags().BoolVar(&noQR, "no-qr", false, "Does nothing; kept for existing scripts")
	_ = cmd.Flags().MarkDeprecated("no-qr", "sign-in no longer prints a QR code")
	return cmd
}

func (c *commandContext) runRemoteHostLink(ctx context.Context, out io.Writer, label string) error {
	// The daemon's AO Cloud, not this shell's: its connector asks that one for
	// the machine's address.
	var settings struct {
		CloudControlPlaneURL string `json:"cloudControlPlaneUrl"`
	}
	if err := c.doJSON(ctx, http.MethodGet, "settings", nil, &settings); err != nil {
		return remoteHostDaemonError(err)
	}
	cloudBase := strings.TrimRight(settings.CloudControlPlaneURL, "/")
	if cloudBase == "" {
		return errors.New("no Orchestrator Cloud connection is configured on this machine")
	}

	// Nothing on this machine changes until the sign-in succeeds, so a
	// declined or abandoned sign-in leaves remote access as it was.
	session, err := remoteHostSignIn(ctx, out)
	if err != nil {
		return err
	}
	var status remoteHostStatus
	if err := c.doJSON(ctx, http.MethodGet, "mobile/status", nil, &status); err != nil {
		return remoteHostDaemonError(err)
	}
	if !status.Enabled {
		// A machine with no screen is reached only through the tunnel, so its
		// listener stays on loopback.
		if err := c.doJSON(ctx, http.MethodPost, "mobile/enable-tunnel-only", nil, &status); err != nil {
			return remoteHostDaemonError(err)
		}
	}
	if status.Password == "" || status.HostID == "" {
		return errors.New("remote access did not start; run `ao remote-host status`")
	}
	// The account's devices reach the machine through its tunnel; this starts
	// one on a listener that was LAN-only, as `enable --tunnel` does.
	if err := c.doJSON(ctx, http.MethodPost, "mobile/remote-access", nil, &status); err != nil {
		return remoteHostDaemonError(err)
	}
	client := &http.Client{Timeout: 30 * time.Second}
	var directory accountHostDirectory
	if err := cloudJSON(ctx, client, http.MethodGet, cloudBase+"/api/cloud/v1/me/hosts", session.AccessToken, nil, &directory); err != nil {
		return fmt.Errorf("read your Orchestrator account's machines: %w", err)
	}
	listedLabel, listedToken := "", ""
	for _, host := range directory.Hosts {
		if host.HostID == status.HostID {
			listedLabel, listedToken = host.Label, host.Token
		}
	}
	// The same account gets the token it already holds, so linking again is
	// safe; another account rotates it, taking the machine from the old one.
	var issued remoteHostAccountToken
	headers := map[string]string{"Authorization": "Bearer " + status.Password, "X-AO-Account-ID": session.User.ID}
	if err := c.doJSONPathWithHeaders(ctx, http.MethodPost, "/api/v1/remote-host/account-token", nil, &issued, headers); err != nil {
		return remoteHostDaemonError(err)
	}
	// Keep a name set on another device unless --label replaces it.
	if label = fitHostLabel(label); label == "" {
		label = listedLabel
	}
	if label == "" {
		hostname, _ := os.Hostname()
		label = fitHostLabel(hostname)
	}
	if label == "" {
		label = "Remote host"
	}
	registration := map[string]string{"label": label, "token": issued.Token}
	if directory.HostKeys && issued.HostKey != "" {
		registration["hostKey"] = issued.HostKey
	}
	if !directory.FixedAddresses {
		address, err := c.waitForTunnelAddress(ctx, false)
		if err != nil {
			return err
		}
		registration["url"] = address
	}
	put := cloudBase + "/api/cloud/v1/me/hosts/" + url.PathEscape(issued.HostID)
	// No time limit: AO Cloud may first make or retire the machine's tunnel,
	// which can take more than a minute, and finishes either way.
	putClient := &http.Client{}
	err = cloudJSON(ctx, putClient, http.MethodPut, put, session.AccessToken, registration, nil)
	var refused *cloudError
	if errors.As(err, &refused) && noFixedAddressNow(refused.status) && registration["url"] == "" {
		// AO Cloud could not make the fixed address: list the machine at its
		// quick tunnel instead, which AO Cloud follows when the address
		// changes. The machine keeps asking for the fixed address.
		address, waitErr := c.waitForTunnelAddress(ctx, false)
		if waitErr != nil {
			return waitErr
		}
		registration["url"] = address
		err = cloudJSON(ctx, putClient, http.MethodPut, put, session.AccessToken, registration, nil)
	}
	if err != nil {
		return fmt.Errorf("add this machine to your Orchestrator account: %w; run `ao remote-host link` again", err)
	}
	message := fmt.Sprintf("Linked %q to %s.\n", label, session.User.Email)
	if listedToken == issued.Token && listedLabel == label {
		message = fmt.Sprintf("This machine is already linked to %s.\n", session.User.Email)
	}
	if _, err := io.WriteString(out, message); err != nil {
		return err
	}

	// The connector asks AO Cloud for this machine's address now that an
	// account holds it.
	if err := c.doJSON(ctx, http.MethodPost, "mobile/remote-access", nil, &status); err != nil {
		return remoteHostDaemonError(err)
	}
	address, err := c.waitForTunnelAddress(ctx, directory.FixedAddresses && registration["url"] == "")
	if errors.Is(err, errTunnelNotReady) {
		_, err = fmt.Fprintln(out, "The address is not ready yet; run `ao remote-host status` in a minute.")
		return err
	}
	if err != nil {
		return err
	}
	_, err = fmt.Fprintf(out, "Address: %s\nYour desktops and phones signed in to %s list this machine within about 30 seconds.\n"+
		"Cloudflare terminates TLS and can see the connection password and traffic.\n", address, session.User.Email)
	return err
}

// noFixedAddressNow reports AO Cloud's answers to a registration without
// `url` that mean it could not make the fixed address: out of fixed
// addresses (409), too many fixed-address writes (429), or Cloudflare failed
// (502). A registration with `url` still lists the machine.
func noFixedAddressNow(status int) bool {
	return status == http.StatusConflict || status == http.StatusTooManyRequests || status == http.StatusBadGateway
}

// waitForTunnelAddress returns the tunnel's https origin once the daemon
// reports one; with fixed, only once it is the fixed address.
func (c *commandContext) waitForTunnelAddress(ctx context.Context, fixed bool) (string, error) {
	deadline := c.deps.Now().Add(90 * time.Second)
	for {
		if err := ctx.Err(); err != nil {
			return "", err
		}
		var status remoteHostStatus
		if err := c.doJSON(ctx, http.MethodGet, "mobile/status", nil, &status); err != nil {
			return "", remoteHostDaemonError(err)
		}
		if !fixed || status.Tunnel.Fixed {
			for _, endpoint := range status.Endpoints {
				if endpoint.Kind == "tunnel" && endpoint.Secure {
					origin := "https://" + endpoint.Host
					if endpoint.Port != 443 && endpoint.Port != 0 {
						origin += ":" + strconv.Itoa(endpoint.Port)
					}
					return origin, nil
				}
			}
		}
		if !status.Tunnel.Supported && !status.Tunnel.Installing {
			return "", errors.New("tunnel unavailable: install cloudflared, then rerun `ao remote-host link`")
		}
		if !c.deps.Now().Before(deadline) {
			return "", errTunnelNotReady
		}
		c.deps.Sleep(2 * time.Second)
	}
}

type cloudError struct {
	status int
	code   string
}

func (e *cloudError) Error() string {
	if e.code != "" {
		return fmt.Sprintf("Orchestrator Cloud answered %d (%s)", e.status, e.code)
	}
	return fmt.Sprintf("Orchestrator Cloud answered %d", e.status)
}

func cloudJSON(ctx context.Context, client *http.Client, method, target, bearer string, body, out any) error {
	var reader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reader = bytes.NewReader(data)
	}
	req, err := http.NewRequestWithContext(ctx, method, target, reader)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+bearer)
	req.Header.Set("Accept", "application/json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	res, err := client.Do(req)
	if err != nil {
		return err
	}
	defer func() { _ = res.Body.Close() }()
	data, err := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if err != nil {
		return err
	}
	if res.StatusCode >= 300 {
		var envelope struct {
			Code string `json:"code"`
		}
		_ = json.Unmarshal(data, &envelope)
		return &cloudError{status: res.StatusCode, code: envelope.Code}
	}
	if out == nil || len(data) == 0 {
		return nil
	}
	return json.Unmarshal(data, out)
}

func fitHostLabel(name string) string {
	runes := []rune(strings.TrimSpace(name))
	for len(string(runes)) > remoteHostLinkLabelMaxBytes {
		runes = runes[:len(runes)-1]
	}
	return strings.TrimSpace(string(runes))
}
