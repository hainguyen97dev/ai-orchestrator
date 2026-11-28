import type { QueryClient } from "@tanstack/react-query";
import type { NotificationListStatus, NotificationsPage } from "../lib/notifications";

type NotificationHost = { hostId: string; label: string; data?: NotificationsPage; isError: boolean; isLoading: boolean };
export const remoteNotificationsQueryKey = (hostId: string, status: NotificationListStatus) => ["removed-host-notifications", hostId, status] as const;
export function connectRemoteNotificationStreams(_queryClient: QueryClient): () => void { return () => undefined; }
export async function fetchRemoteNotificationsPage(_hostId: string, _status: NotificationListStatus, _cursor = ""): Promise<NotificationsPage> {
	return { notifications: [], unreadCount: 0, nextCursor: null } as unknown as NotificationsPage;
}
export async function markRemoteNotificationsRead(_hostId: string, _ids: string[], _queryClient: QueryClient): Promise<void> {}
export async function clearRemoteNotifications(_hostId: string, _queryClient: QueryClient): Promise<void> {}
export async function clearRemoteNotification(_hostId: string, _id: string, _queryClient: QueryClient): Promise<void> {}
export function useRemoteNotificationHosts(_status: NotificationListStatus, _enabled = true): { hosts: NotificationHost[]; totalUnreadCount: number } {
	return { hosts: [], totalUnreadCount: 0 };
}
