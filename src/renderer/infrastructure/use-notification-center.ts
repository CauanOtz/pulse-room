import { useEffect, useRef } from 'react';
import type { ChatMessage, Community, CommunityDetail, DirectConversation } from '../../shared/community';
import { readableMentions } from '../../shared/mentions';
import { badgesForMessage, notifiesForDirect, notifiesForMessage } from '../domain/notifications';
import type { CommunityClient } from './community-client';
import type { LiveConnection } from './live-connection';
import { RoomSoundPlayer } from './media/room-sound-player';
import { notificationStore } from './notification-store';

const chime = new RoomSoundPlayer();
/** Several messages in a burst ring once. */
const chimeGapMs = 1_200;
/** What is known of a server other than the one open: names, for the text of a notification. */
const detailKeptMs = 5 * 60_000;

interface Options {
  api: CommunityClient;
  userId?: string;
  live?: LiveConnection;
  servers: readonly Community[];
  /** The server open in the room, whose names are already at hand. */
  detail?: CommunityDetail;
  openChannel(serverId: string, channelId: string): void;
  openConversation(conversationId: string): void;
}

const preview = (text: string, attachments = 0) =>
  text.trim()
    ? text.replace(/\s+/g, ' ').slice(0, 180)
    : attachments
      ? attachments === 1
        ? 'Sent a file'
        : `Sent ${attachments} files`
      : 'Sent a message';

/**
 * Turns what the server says into notifications: a message that names you,
 * every message in a server set to all of them, and direct messages. The
 * server only says where something happened; the words are read here,
 * through the API, with the reader's own permissions.
 */
export function useNotificationCenter({
  api,
  userId,
  live,
  servers,
  detail,
  openChannel,
  openConversation,
}: Options): void {
  const known = useRef({ servers, detail, openChannel, openConversation });
  known.current = { servers, detail, openChannel, openConversation };
  const details = useRef(new Map<string, { at: number; detail: Promise<CommunityDetail> }>());
  const lastChime = useRef(0);

  useEffect(() => notificationStore.signIn(userId), [userId]);

  useEffect(() => {
    if (!userId || !live) return undefined;

    const detailOf = (serverId: string): Promise<CommunityDetail> => {
      const open = known.current.detail;
      if (open?.server.id === serverId) return Promise.resolve(open);
      const cached = details.current.get(serverId);
      if (cached && Date.now() - cached.at < detailKeptMs) return cached.detail;
      const read = api.request<CommunityDetail>(`/api/servers/${serverId}`);
      details.current.set(serverId, { at: Date.now(), detail: read });
      read.catch(() => details.current.delete(serverId));
      return read;
    };

    const present = (title: string, body: string, tag: string, mentioned: boolean) => {
      const settings = notificationStore.settings;
      if (settings.sound && Date.now() - lastChime.current > chimeGapMs) {
        lastChime.current = Date.now();
        chime.play(mentioned ? 'mention' : 'message');
      }
      if (!settings.desktop) return;
      const desktop = window.desktop?.notifications;
      if (desktop) {
        void desktop.show({ title, body, tag }).catch(() => undefined);
        return;
      }
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
      const shown = new Notification(title, { body, tag, silent: true });
      shown.onclick = () => {
        window.focus();
        open(tag);
      };
    };

    const announceMessage = async (event: {
      serverId: string;
      channelId: string;
      messageId: string;
      mentioned: boolean;
    }) => {
      const [server, { messages }] = await Promise.all([
        detailOf(event.serverId),
        api.request<{ messages: ChatMessage[] }>(`/api/channels/${event.channelId}/messages`),
      ]);
      const message = messages.find((each) => each.id === event.messageId);
      if (!message) return;
      const channel = server.channels.find((each) => each.id === event.channelId);
      const serverName =
        known.current.servers.find((each) => each.id === event.serverId)?.name ?? server.server.name;
      const names = new Map(server.members.map((member) => [member.id, member.displayName]));
      const text = readableMentions(message.content, (id) => names.get(id));
      present(
        `${message.authorName} (#${channel?.name ?? 'channel'}, ${serverName})`,
        preview(text, message.attachments?.length),
        `channel:${event.serverId}:${event.channelId}`,
        event.mentioned,
      );
    };

    const announceDirect = async (conversationId: string) => {
      const { conversations } = await api.request<{ conversations: DirectConversation[] }>('/api/directs');
      const conversation = conversations.find((each) => each.id === conversationId);
      const last = conversation?.lastMessage;
      if (!conversation || !last || last.authorId === userId) return;
      present(
        conversation.peer.displayName,
        last.invite ? 'Sent you an invitation to a server' : preview(last.content),
        `direct:${conversationId}`,
        true,
      );
    };

    const open = (tag: string) => {
      const [kind, first, second] = tag.split(':');
      if (kind === 'channel' && first && second) known.current.openChannel(first, second);
      if (kind === 'direct' && first) known.current.openConversation(first);
    };

    const unlisten = live.listen((event) => {
      if (event.type === 'message') {
        if (event.authorId === userId) return;
        const settings = notificationStore.settings;
        const viewing = notificationStore.viewing();
        if (badgesForMessage(event, settings, viewing))
          notificationStore.mentioned(event.serverId, event.channelId);
        if (notifiesForMessage(event, settings, viewing)) void announceMessage(event).catch(() => undefined);
      }
      if (event.type === 'directs' && event.conversationId && event.authorId && event.authorId !== userId) {
        if (notifiesForDirect(event.conversationId, notificationStore.settings, notificationStore.viewing()))
          void announceDirect(event.conversationId).catch(() => undefined);
      }
    });
    const unclick = window.desktop?.notifications?.onOpen(open);
    return () => {
      unlisten();
      unclick?.();
    };
  }, [api, userId, live]);
}
