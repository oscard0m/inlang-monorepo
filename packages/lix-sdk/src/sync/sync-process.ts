import type { Lix } from "../lix/open-lix.js";
import { pushToServer } from "./push-to-server.js";
import { pullFromServer } from "./pull-from-server.js";
import { toBlob } from "../lix/to-blob.js";

export async function initSyncProcess(args: {
	lix: Pick<Lix, "db" | "plugin" | "sqlite">;
}): Promise<
	| {
			stop: () => void;
	  }
	| undefined
> {
	const lixId = await args.lix.db
		.selectFrom("key_value")
		.where("key", "=", "lix_id")
		.select("value")
		.executeTakeFirstOrThrow();

	let stoped = false;

	const pullAndPush = async () => {
		const shouldSync = await args.lix.db
			.selectFrom("key_value")
			.where("key", "=", "#lix_sync")
			.select("value")
			.executeTakeFirst();

		if (shouldSync?.value !== "true") {
			return;
		}

		const url = await args.lix.db
			.selectFrom("key_value")
			// saved in key value because simpler for experimentation
			.where("key", "=", "lix_server_url")
			.select("value")
			.executeTakeFirst();
		// if you want to test sync, restart the lix app
		// to make sure the experimental-sync-url is set
		if (!url) {
			return;
		}

		try {
			// console.log("----------- PULL FROM SERVER -------------");
			const serverState = await pullFromServer({
				serverUrl: url.value,
				lix: args.lix,
				id: lixId.value,
			});
			// console.log(
			// 	"----------- DONE PULL FROM SERVER ------------- New known Server state: ",
			// 	serverState
			// );
			// console.log("----------- PUSH TO SERVER -------------");
			await pushToServer({
				serverUrl: url.value,
				lix: args.lix,
				id: lixId.value,
				targetVectorClock: serverState,
			});
		} catch (e) {
			// likely that lix didn't exist on the server
			const response = await fetch(
				new Request(url.value + "/lsa/new-v1", {
					method: "POST",
					body: await toBlob({ lix: args.lix }),
				})
			);
			if (!response.ok && response.status !== 409) {
				throw e;
			}
		}
		// console.log("----------- DONE PUSH TO SERVER -------------");
	};

	// naive implementation that syncs every second

	function schedulePullAndPush() {
		if (!stoped) {
			pullAndPush().catch((e) => {
				console.error("Error in sync process", e);
			});
		}
		setTimeout(() => {
			schedulePullAndPush();
		}, 1000);
	}

	schedulePullAndPush();

	return {
		stop: () => {
			stoped = true;
		},
	};
}