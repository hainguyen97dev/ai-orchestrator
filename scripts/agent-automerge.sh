#!/usr/bin/env bash
# Merge open PRs labelled `automerge` once every check on their head commit has passed.
#
# Usage: agent-automerge.sh [PR_NUMBER...]
#   No numbers: evaluate every open PR carrying the label.
#
# Env:
#   GH_REPO        owner/repo (required outside a checkout of the repo)
#   LABEL          opt-in label                      (default: automerge)
#   BLOCK_LABEL    label that vetoes a merge         (default: do-not-merge)
#   BASE_BRANCH    only merge into this branch       (default: main)
#   GATE_CHECK     check run that must have passed   (default: ci-ok)
#   MERGE_METHOD   squash | merge | rebase           (default: squash)
#   SELF_WORKFLOW  workflow name to ignore in checks (default: Agent auto-merge)
#   DRY_RUN        1 = report only, never merge
set -euo pipefail

LABEL=${LABEL:-automerge}
BLOCK_LABEL=${BLOCK_LABEL:-do-not-merge}
BASE_BRANCH=${BASE_BRANCH:-main}
GATE_CHECK=${GATE_CHECK:-ci-ok}
MERGE_METHOD=${MERGE_METHOD:-squash}
SELF_WORKFLOW=${SELF_WORKFLOW:-Agent auto-merge}
DRY_RUN=${DRY_RUN:-0}

log() { printf '#%s: %s\n' "$1" "$2"; }

evaluate() {
  local pr=$1 json mergeable attempt verdict sha
  for attempt in 1 2 3 4 5; do
    json=$(gh pr view "$pr" --json number,state,isDraft,baseRefName,headRefOid,isCrossRepository,mergeable,labels,statusCheckRollup)
    mergeable=$(jq -r .mergeable <<<"$json")
    [[ $mergeable != UNKNOWN ]] && break
    sleep $((attempt * 3)) # GitHub computes mergeability lazily
  done

  verdict=$(jq -r \
    --arg label "$LABEL" --arg block "$BLOCK_LABEL" --arg base "$BASE_BRANCH" \
    --arg gate "$GATE_CHECK" --arg self "$SELF_WORKFLOW" '
    def ok_conclusion: . as $c | ["SUCCESS","SKIPPED","NEUTRAL"] | index($c) != null;
    ([.labels[].name]) as $labels
    | ([.statusCheckRollup[] | select((.workflowName // "") != $self)]) as $checks
    | if .state != "OPEN" then "skip: not open"
      elif ($labels | index($label)) == null then "skip: no \($label) label"
      elif ($labels | index($block)) != null then "skip: has \($block) label"
      elif .isDraft then "skip: draft"
      elif .isCrossRepository then "skip: PR from a fork"
      elif .baseRefName != $base then "skip: base is \(.baseRefName), not \($base)"
      elif .mergeable == "CONFLICTING" then "skip: merge conflict"
      elif .mergeable != "MERGEABLE" then "skip: mergeability \(.mergeable)"
      elif ([$checks[] | select(.__typename == "CheckRun" and .name == $gate)] | length) == 0
        then "wait: \($gate) has not reported yet"
      elif ([$checks[] | select(.__typename == "CheckRun" and .status != "COMPLETED")] | length) > 0
        then "wait: checks still running"
      elif ([$checks[] | select(.__typename == "StatusContext" and (.state == "PENDING" or .state == "EXPECTED"))] | length) > 0
        then "wait: statuses pending"
      elif ([$checks[] | select(.__typename == "CheckRun" and (.conclusion | ok_conclusion | not))] | length) > 0
        then "skip: failed checks: \([$checks[] | select(.__typename == "CheckRun" and (.conclusion | ok_conclusion | not)) | .name] | join(", "))"
      elif ([$checks[] | select(.__typename == "StatusContext" and .state != "SUCCESS")] | length) > 0
        then "skip: failed statuses"
      else "merge"
      end' <<<"$json")

  if [[ $verdict != merge ]]; then
    log "$pr" "$verdict"
    return 0
  fi

  sha=$(jq -r .headRefOid <<<"$json")
  if [[ $DRY_RUN == 1 ]]; then
    log "$pr" "would merge $sha ($MERGE_METHOD)"
    return 0
  fi
  log "$pr" "merging $sha ($MERGE_METHOD)"
  # --match-head-commit: refuse if someone pushed after the checks we just read.
  gh pr merge "$pr" "--$MERGE_METHOD" --delete-branch --match-head-commit "$sha"
}

prs=("$@")
if [[ ${#prs[@]} -eq 0 ]]; then
  while IFS= read -r n; do [[ -n $n ]] && prs+=("$n"); done \
    < <(gh pr list --state open --label "$LABEL" --json number -q '.[].number')
fi
[[ ${#prs[@]} -eq 0 ]] && { echo "no candidate PRs"; exit 0; }

status=0
for pr in "${prs[@]}"; do
  evaluate "$pr" || { log "$pr" "merge failed"; status=1; }
done
exit $status
