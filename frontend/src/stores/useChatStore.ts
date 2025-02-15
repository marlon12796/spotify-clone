import { axiosInstance } from '@/lib/axios';
import { Message, User } from '@/types';
import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import { AxiosError } from 'axios';

interface ChatStore {
	users: User[];
	isLoading: boolean;
	error: string | null;
	socket: Socket | null;
	isConnected: boolean;
	onlineUsers: Set<string>;
	userActivities: Map<string, string>;
	messages: Message[];
	selectedUser: User | null;

	fetchUsers: () => Promise<void>;
	initSocket: (userId: string) => void;
	disconnectSocket: () => void;
	sendMessage: (receiverId: string, senderId: string, content: string) => void;
	fetchMessages: (userId: string) => Promise<void>;
	setSelectedUser: (user: User | null) => void;
}

const baseURL = import.meta.env.MODE === 'development' ? 'http://localhost:5000' : '/';

export const useChatStore = create<ChatStore>((set, get) => ({
	users: [],
	isLoading: false,
	error: null,
	socket: null,
	isConnected: false,
	onlineUsers: new Set(),
	userActivities: new Map(),
	messages: [],
	selectedUser: null,

	setSelectedUser: (user) => set({ selectedUser: user }),

	fetchUsers: async () => {
		set({ isLoading: true, error: null });
		try {
			const { data } = await axiosInstance.get<User[]>('/users');
			set({ users: data });
		} catch (error: unknown) {
			const errMsg = error instanceof AxiosError && error.response ? error.response.data.message : 'Error al obtener usuarios';
			set({ error: errMsg });
		} finally {
			set({ isLoading: false });
		}
	},

	initSocket: (userId) => {
		if (get().isConnected) return;

		const socket = io(baseURL, {
			autoConnect: false,
			withCredentials: true,
			auth: { userId },
		});

		socket.connect();
		socket.emit('user_connected', userId);

		socket.on('users_online', (users: string[]) => set({ onlineUsers: new Set(users) }));
		socket.on('activities', (activities: [string, string][]) => set({ userActivities: new Map(activities) }));

		socket.on('user_connected', (id) => {
			set((state) => ({
				onlineUsers: new Set([...state.onlineUsers, id]),
			}));
		});

		socket.on('user_disconnected', (id) => {
			set((state) => {
				const updatedUsers = new Set(state.onlineUsers);
				updatedUsers.delete(id);
				return { onlineUsers: updatedUsers };
			});
		});

		socket.on('receive_message', (message: Message) => {
			set((state) => ({ messages: [...state.messages, message] }));
		});

		socket.on('message_sent', (message: Message) => {
			set((state) => ({ messages: [...state.messages, message] }));
		});

		socket.on('activity_updated', ({ userId, activity }) => {
			set((state) => {
				const updatedActivities = new Map(state.userActivities);
				updatedActivities.set(userId, activity);
				return { userActivities: updatedActivities };
			});
		});

		set({ socket, isConnected: true });
	},

	disconnectSocket: () => {
		const socket = get().socket;
		if (socket) {
			socket.disconnect();
			set({ socket: null, isConnected: false });
		}
	},

	sendMessage: (receiverId, senderId, content) => {
		const socket = get().socket;
		if (socket) {
			socket.emit('send_message', { receiverId, senderId, content });
		}
	},

	fetchMessages: async (userId) => {
		set({ isLoading: true, error: null });
		try {
			const { data } = await axiosInstance.get<Message[]>(`/users/messages/${userId}`);
			set({ messages: data });
		} catch (error: unknown) {
			const errMsg = error instanceof AxiosError && error.response ? error.response.data.message : 'Error al obtener mensajes';
			set({ error: errMsg });
		} finally {
			set({ isLoading: false });
		}
	},
}));
