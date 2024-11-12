import { expect, test } from "vitest";
import { openLixInMemory } from "../lix/open-lix-in-memory.js";
import { createChangeConflict } from "./create-change-conflict.js";

test("conflicts should be de-duplicated based on the change_conflict.key", async () => {
	const lix = await openLixInMemory({});

	const currentBranch = await lix.db
		.selectFrom("current_branch")
		.selectAll()
		.executeTakeFirstOrThrow();

	await lix.db
		.insertInto("change")
		.values([
			{
				id: "change0",
				plugin_key: "mock-plugin",
				type: "mock",
				file_id: "mock",
				entity_id: "value0",
				snapshot_id: "no-content",
			},
			{
				id: "change1",
				plugin_key: "mock-plugin",
				file_id: "mock",
				entity_id: "value1",
				type: "mock",
				snapshot_id: "no-content",
			},
		])
		.execute();

	const changeConflict = await createChangeConflict({
		lix,
		branch: currentBranch,
		key: "mock-conflict",
		conflictingChangeIds: new Set(["change0", "change1"]),
	});

	// Check that no new conflict is created
	const conflictsAfter1Creation = await lix.db
		.selectFrom("change_conflict")
		.where("change_conflict.key", "=", "mock-conflict")
		.selectAll()
		.execute();

	expect(conflictsAfter1Creation.length).toBe(1);
	expect(conflictsAfter1Creation[0]?.id).toBe(changeConflict.id);
	expect(conflictsAfter1Creation[0]?.key).toBe("mock-conflict");

	// Create a second conflict
	const changeConflict2 = await createChangeConflict({
		lix,
		branch: currentBranch,
		key: "mock-conflict",
		conflictingChangeIds: new Set(["change0", "change1"]),
	});

	// Check that no new conflict is created
	const conflictsAfter2Creation = await lix.db
		.selectFrom("change_conflict")
		.where("change_conflict.key", "=", "mock-conflict")
		.selectAll()
		.execute();

	expect(conflictsAfter2Creation.length).toBe(1);
	expect(conflictsAfter2Creation[0]?.id).toBe(changeConflict2.id);
	expect(conflictsAfter2Creation[0]?.key).toBe("mock-conflict");
});

// unsure about this behavior. might lead to unexpected behavior down the road.
// we can leave it as is for now, but we should keep an eye on it
test("if a conflict set contains the same changes for a given key, no new conflict should be created", async () => {
	const lix = await openLixInMemory({});
	const currentBranch = await lix.db
		.selectFrom("current_branch")
		.selectAll()
		.executeTakeFirstOrThrow();

	await lix.db
		.insertInto("change")
		.values([
			{
				id: "change0",
				plugin_key: "mock-plugin",
				type: "mock",
				file_id: "mock",
				entity_id: "value0",
				snapshot_id: "no-content",
			},
			{
				id: "change1",
				plugin_key: "mock-plugin",
				file_id: "mock",
				entity_id: "value1",
				type: "mock",
				snapshot_id: "no-content",
			},
			{
				id: "change2",
				plugin_key: "mock-plugin",
				file_id: "mock",
				entity_id: "value1",
				type: "mock",
				snapshot_id: "no-content",
			},
		])
		.execute();

	const changeConflict = await createChangeConflict({
		lix,
		branch: currentBranch,
		key: "mock-conflict",
		conflictingChangeIds: new Set(["change0", "change1"]),
	});

	// Check that no new conflict is created
	const conflictElements = await lix.db
		.selectFrom("change_conflict_element")
		.where("change_conflict_id", "=", changeConflict.id)
		.selectAll()
		.execute();

	expect(conflictElements.length).toBe(2);
	expect(conflictElements[0]?.change_id).toBe("change0");
	expect(conflictElements[1]?.change_id).toBe("change1");

	const changeConflict2 = await createChangeConflict({
		lix,
		branch: currentBranch,
		key: "mock-conflict",
		conflictingChangeIds: new Set(["change0", "change1"]),
	});

	expect(changeConflict2.id).toBe(changeConflict.id);

	const changeConflict3 = await createChangeConflict({
		lix,
		branch: currentBranch,
		key: "mock-conflict-other",
		// 2 was preivously not in the conflict
		conflictingChangeIds: new Set(["change1", "change2"]),
	});

	// Check that no new conflict is created
	const conflictsAfter3Creation = await lix.db
		.selectFrom("change_conflict")
		.selectAll()
		.execute();

	const conflictElementsAfter3Creation = await lix.db
		.selectFrom("change_conflict_element")
		.where("change_conflict_id", "=", changeConflict3.id)
		.selectAll()
		.execute();

	expect(conflictsAfter3Creation.length).toBe(2);
	expect(conflictsAfter3Creation.map((c) => c.key)).toStrictEqual([
		"mock-conflict",
		"mock-conflict-other",
	]);
	expect(conflictsAfter3Creation.map((c) => c.id)).toStrictEqual([
		changeConflict.id,
		changeConflict3.id,
	]);
	expect(conflictElementsAfter3Creation.length).toBe(2);
});