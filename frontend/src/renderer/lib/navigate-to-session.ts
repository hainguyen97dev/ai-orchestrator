import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { type HostId } from "./session-keys";
import { STANDALONE_WORKSPACE_ID } from "../types/workspace";

export type SessionNavigateTarget =
	| { to: "/sessions/$sessionId"; params: { sessionId: string } }
	| { to: "/projects/$projectId/sessions/$sessionId"; params: { projectId: string; sessionId: string } };

/** B1 retains optional host IDs in shared types, but no longer routes to hosts. */
export function projectNavigateTarget(projectId: string, _host?: HostId) {
	return { to: "/projects/$projectId" as const, params: { projectId } };
}

export function sessionNavigateTarget(projectId: string | undefined, sessionId: string, _host?: HostId): SessionNavigateTarget {
	if (!projectId || projectId === STANDALONE_WORKSPACE_ID) return { to: "/sessions/$sessionId", params: { sessionId } };
	return { to: "/projects/$projectId/sessions/$sessionId", params: { projectId, sessionId } };
}

export function useNavigateToSession(): (projectId: string | undefined, sessionId: string, host?: HostId) => void {
	const navigate = useNavigate();
	return useCallback((projectId, sessionId, host) => {
		if (!sessionId) return;
		void navigate(sessionNavigateTarget(projectId, sessionId, host));
	}, [navigate]);
}
