import type { Lix } from "../lix/open-lix.js";
import { pushToServer } from "./push-to-server.js";
import { pullFromServer } from "./pull-from-server.js";

export async function initSyncProcess(args: {
	lix: Pick<Lix, "db" | "plugin">;
}): Promise<
	| {
			stop: () => void;
	  }
	| undefined
> {
	console.log("initializing sync process");
	const { value: id } = await args.lix.db
		.selectFrom("key_value")
		.where("key", "=", "lix-id")
		.select("value")
		.executeTakeFirstOrThrow();

	const url = await args.lix.db
		.selectFrom("key_value")
		// saved in key value because simpler for experimentation
		.where("key", "=", "lix-experimental-server-url")
		.select("value")
		.executeTakeFirst();

	// if you want to test sync, restart the lix app
	// to make sure the experimental-sync-url is set
	if (!url) {
		console.log(
			'no "lix-experimental-server-url" set, setting it to "http://localhost:3000"'
		);
		return;
	}

	let stoped = false;

	const pullAndPush = async () => {
		console.log("----------- PULL FROM SERVER -------------");
		const serverState = await pullFromServer({
			serverUrl: url.value,
			lix: args.lix,
			id,
		});
		console.log(
			"----------- DONE PULL FROM SERVER ------------- New known Server state: ",
			serverState
		);
		console.log("----------- PUSH TO SERVER -------------");
		await pushToServer({
			serverUrl: url.value,
			lix: args.lix,
			id,
			targetVectorClock: serverState,
		});
		console.log("----------- DONE PUSH TO SERVER -------------");
	};

	// naive implementation that syncs every second

	async function schedulePullAndPush() {
		if (!stoped) {
			await pullAndPush();
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
