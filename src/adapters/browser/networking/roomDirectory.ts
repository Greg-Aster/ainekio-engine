import type { NetworkPeerId } from "../../../modules/networking/index.js";
import type { RoomDirectoryPort } from "../../../multiplayer/index.js";

export type RoomDirectoryFetch = (
	input: RequestInfo | URL,
	init?: RequestInit,
) => Promise<Response>;

export function createHttpRoomDirectory(options: {
	readonly baseUrl: string;
	readonly fetch?: RoomDirectoryFetch;
}): RoomDirectoryPort {
	const baseUrl = options.baseUrl.replace(/\/+$/, "");
	const fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);

	return {
		async register(roomName, hostId) {
			const response = await fetcher(`${baseUrl}/register`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ roomName, hostId }),
			});

			if (!response.ok) {
				throw new Error(await responseErrorMessage(response));
			}
		},
		async lookup(roomName) {
			const response = await fetcher(
				`${baseUrl}/lookup/${encodeURIComponent(roomName)}`,
			);

			if (!response.ok) {
				throw new Error(await responseErrorMessage(response));
			}

			const payload = (await response.json()) as {
				readonly hostId?: NetworkPeerId;
			};

			if (!payload.hostId || typeof payload.hostId !== "string") {
				throw new Error(`Room "${roomName}" did not return a host peer ID.`);
			}

			return payload.hostId;
		},
	};
}

async function responseErrorMessage(response: Response): Promise<string> {
	const text = await response.text().catch(() => "");

	if (response.status === 404) {
		return "Room not found. Check the room name or create a new room.";
	}

	return text.length > 0
		? `Room directory request failed (${response.status}): ${text}`
		: `Room directory request failed (${response.status}).`;
}
