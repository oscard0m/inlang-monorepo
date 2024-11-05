import type { Conflict, NewChange, Snapshot } from "../database/schema.js";
import type { Lix } from "../lix/open-lix.js";
import {
	ChangeAlreadyExistsError,
	ChangeDoesNotBelongToFileError,
	ChangeNotDirectChildOfConflictError,
} from "./errors.js";

/**
 * Resolves a conflict by applying the given change.
 */
export async function resolveConflictWithNewChange(args: {
	lix: Lix;
	conflict: Conflict;
	newChange: Omit<NewChange, "snapshot_id"> & {
		snapshot_content: Snapshot["content"];
	};
	parentIds: string[];
}): Promise<void> {
	const plugins = await args.lix.plugin.getAll();
	if (plugins.length !== 1) {
		throw new Error("Unimplemented. Only one plugin is supported for now");
	}

	const plugin = plugins[0];
	if (plugin?.applyChanges === undefined) {
		throw new Error(
			"Plugin does not support applying changes and therefore cannot resolve conflicts",
		);
	}

	const change = await args.lix.db
		.selectFrom("change")
		.selectAll()
		.where("id", "=", args.conflict.change_id)
		.executeTakeFirstOrThrow();

	if (change.file_id !== args.newChange.file_id) {
		throw new ChangeDoesNotBelongToFileError();
	} else if (args.parentIds.includes(change.id) === false) {
		throw new ChangeNotDirectChildOfConflictError();
	}

	const newChangeAlreadyExists = args.newChange.id
		? await args.lix.db
				.selectFrom("change")
				.select("id")
				.where("id", "=", args.newChange.id)
				.executeTakeFirst()
		: undefined;

	if (newChangeAlreadyExists) {
		throw new ChangeAlreadyExistsError({ id: args.newChange.id! });
	}

	const file = await args.lix.db
		.selectFrom("file")
		.selectAll()
		.where("id", "=", change.file_id)
		.executeTakeFirstOrThrow();

	const { fileData } = await plugin.applyChanges({
		lix: args.lix,
		file: file,
		changes: [
			// @ts-expect-error - newChange is a change with a snapshot
			args.newChange,
		],
	});

	const snapshotContent = args.newChange.snapshot_content!;

	await args.lix.db.transaction().execute(async (trx) => {
		await trx
			.updateTable("file")
			.set("data", fileData)
			.where("id", "=", change.file_id)
			.execute();

		const snapshot = await trx
			.insertInto("snapshot")
			.values({ content: snapshotContent })
			.onConflict((oc) => oc.doNothing())
			.returningAll()
			.executeTakeFirstOrThrow();

		const insertedChange = await trx
			.insertInto("change")
			.values({
				...args.newChange,
				// @ts-expect-error - newChange is a change with a snapshot
				snapshot_content: undefined,
				snapshot_id: snapshot.id,
			})
			.returning("id")
			.executeTakeFirstOrThrow();

		for (const id of args.parentIds) {
			await trx
				.insertInto("change_graph_edge")
				.values({
					parent_id: id,
					child_id: insertedChange.id,
				})
				.execute();
		}

		await trx
			.updateTable("conflict")
			.where((eb) =>
				eb.and({
					change_id: args.conflict.change_id,
					conflicting_change_id: args.conflict.conflicting_change_id,
					resolved_change_id: undefined,
				}),
			)
			.set("resolved_change_id", insertedChange.id)
			.execute();
	});
}