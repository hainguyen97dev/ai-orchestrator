import { Search } from "@/components/app-icons";
import { useEffect, useState } from "react";
import { RadioGroup } from "radix-ui";
import { useTranslation } from "react-i18next";
import { useCloudGate } from "../../hooks/useCloudGate";
import type { HarnessDiagnosticsRequest } from "../../stores/ui-store";
import { CloudHarnessContent } from "./harness/CloudHarnessContent";
import { LocalHarnessContent } from "./harness/LocalHarnessContent";
import { SettingsSection } from "./SettingsSection";

export type HarnessView = "local" | "cloud";

export function HarnessSettingsSection({
	focusAgentId,
	initialView = "local",
	startLogin = false,
	showDiagnostics,
	titleHidden = false,
}: {
	focusAgentId?: string;
	initialView?: HarnessView;
	/** Start focusAgentId's local login flow once its row is ready (a shortcut from a login error elsewhere). */
	startLogin?: boolean;
	/** Open focusAgentId's local install or update diagnostics (a shortcut from a failed update notice). */
	showDiagnostics?: HarnessDiagnosticsRequest;
	titleHidden?: boolean;
}) {
	const { t } = useTranslation();
	const { cloudEnabled } = useCloudGate();
	const [view, setView] = useState<HarnessView>(initialView);
	const [search, setSearch] = useState("");
	useEffect(() => setView(initialView), [initialView]);
	const cloudView = cloudEnabled && view === "cloud";
	// An open harness page replaces the list, so its search and filters step aside.
	const [detailOpen, setDetailOpen] = useState(false);
	const showToolbar = cloudView || !detailOpen;
	return <SettingsSection
		title={t("settings.harness")}
		titleHidden={titleHidden}
		sectionId="harness"
		toolbar={showToolbar ? (<div className="flex shrink-0 items-center gap-2 pb-3">
			<label className="flex h-9! min-w-0 flex-1 items-center gap-2 rounded-md border border-(--color-border-settings-input) bg-(--color-bg-settings-input) px-3">
				<Search aria-hidden="true" className="size-4 shrink-0 text-settings-muted" />
				<span className="sr-only">{t("settings.harness.search")}</span>
				<input aria-label={t("settings.harness.search")} className="min-w-0 flex-1 bg-transparent text-sm text-settings-label outline-none placeholder:text-settings-muted" placeholder={t("settings.harness.searchPlaceholder")} value={search} onChange={(event) => setSearch(event.target.value)} />
			</label>
			{cloudEnabled ? <RadioGroup.Root value={cloudView ? "cloud" : "local"} onValueChange={(value) => setView(value as HarnessView)} aria-label={t("settings.harness.viewLabel")} className="settings-segment rounded-md">
				<RadioGroup.Item value="local" className="settings-segment-item rounded-md">{t("settings.harness.viewLocal")}</RadioGroup.Item>
				<RadioGroup.Item value="cloud" className="settings-segment-item rounded-md">{t("settings.harness.viewCloud")}</RadioGroup.Item>
			</RadioGroup.Root> : null}
		</div>) : null}
	>

		{cloudView ? <CloudHarnessContent focusAgentId={focusAgentId} search={search} /> : <LocalHarnessContent focusAgentId={focusAgentId} search={search} onDetailChange={setDetailOpen} startLogin={startLogin} showDiagnostics={showDiagnostics} />}
	</SettingsSection>;
}
