import { test, expect } from "vitest";
import * as LixServerApi from "@lix-js/server-api-schema";
import { openLixInMemory } from "../../lix/open-lix-in-memory.js";
import { createServerApiHandler } from "../create-server-api-handler.js";
import { mockJsonSnapshot } from "../../snapshot/mock-json-snapshot.js";
import { mockChange } from "../../change/mock-change.js";
import { createLsaInMemoryEnvironment } from "../environment/create-in-memory-environment.js";

type RequestBody =
	LixServerApi.paths["/lsa/pull-v1"]["post"]["requestBody"]["content"]["application/json"];

test("it should pull rows successfully", async () => {
	const lix = await openLixInMemory({});

	const id = await lix.db
		.selectFrom("key_value")
		.where("key", "=", "lix_id")
		.selectAll()
		.executeTakeFirstOrThrow();

	const mockChanges = [
		mockChange({ id: "change0" }),
		mockChange({ id: "change1" }),
	];

	await lix.db.insertInto("change").values(mockChanges).execute();

	const environment = createLsaInMemoryEnvironment();

	await environment.setLix({ id: id.value, blob: await lix.toBlob() });

	const lsaHandler = await createServerApiHandler({ environment });

	const response = await lsaHandler(
		new Request("http://localhost:3000/lsa/pull-v1", {
			method: "POST",
			body: JSON.stringify({
				lix_id: id.value,
				// empty vecotr clock equals pull all rows
				vector_clock: [],
			} satisfies RequestBody),
			headers: {
				"Content-Type": "application/json",
			},
		})
	);

	expect(response.status).toBe(200);
	const responseJson =
		(await response.json()) as LixServerApi.paths["/lsa/pull-v1"]["post"]["responses"]["200"]["content"]["application/json"];

	expect(responseJson.data).toBeDefined();

	const changeTable = Object.entries(responseJson.data).find(
		(table) => table[0] === "change"
	)!;
	expect(changeTable).toBeDefined();
	expect(changeTable[1].length).toBeGreaterThan(0);
	expect(changeTable[1]).toEqual(expect.arrayContaining(mockChanges));
});

test("it should specifically be able to handle snapshots which use json binary and should not transfer the id", async () => {
	const lix = await openLixInMemory({});
	const { value: id } = await lix.db
		.selectFrom("key_value")
		.where("key", "=", "lix_id")
		.selectAll()
		.executeTakeFirstOrThrow();

	const mockSnapshot = mockJsonSnapshot({
		key: "test-key-1",
		value: "test-value-1",
	});

	// Add data to multiple tables
	await lix.db
		.insertInto("snapshot")
		.values([{ content: mockSnapshot.content }])
		.execute();

	const environment = createLsaInMemoryEnvironment();
	await environment.setLix({ id, blob: await lix.toBlob() });

	const lsa = await createServerApiHandler({ environment });

	const response = await lsa(
		new Request("http://localhost:3000/lsa/pull-v1", {
			method: "POST",
			body: JSON.stringify({
				lix_id: id,
				vector_clock: [],
			} satisfies RequestBody),
			headers: {
				"Content-Type": "application/json",
			},
		})
	);

	expect(response.status).toBe(200);
	const responseJson =
		(await response.json()) as LixServerApi.paths["/lsa/pull-v1"]["post"]["responses"]["200"]["content"]["application/json"];

	expect(responseJson.data).toBeDefined();

	const snapshots = Object.entries(responseJson.data).find(
		(table) => table[0] === "snapshot"
	)!;
	expect(snapshots).toBeDefined();
	expect(snapshots[1].length).toBeGreaterThan(0);
	expect(snapshots[1]).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				// expecting no id
				content: mockSnapshot.content,
			}),
		])
	);
});

test("it should return 404 if the Lix file is not found", async () => {
	const environment = createLsaInMemoryEnvironment();

	const lsa = await createServerApiHandler({ environment });

	const response = await lsa(
		new Request("http://localhost:3000/lsa/pull-v1", {
			method: "POST",
			body: JSON.stringify({
				lix_id: "nonexistent-id",
				vector_clock: [],
			} satisfies RequestBody),
			headers: {
				"Content-Type": "application/json",
			},
		})
	);

	expect(response.status).toBe(404);
});

test("it should return 500 if the Lix file is invalid", async () => {
	const environment = createLsaInMemoryEnvironment();

	await environment.setLix({
		id: "invalid-lix",
		blob: new Blob(["invalid data"]),
	});

	const lsaHandler = await createServerApiHandler({ environment });

	const response = await lsaHandler(
		new Request("http://localhost:3000/lsa/pull-v1", {
			method: "POST",
			body: JSON.stringify({
				lix_id: "invalid-lix",
			}),
			headers: {
				"Content-Type": "application/json",
			},
		})
	);

	expect(response.status).toBe(500);
});

test("it should handle empty tables gracefully", async () => {
	const lix = await openLixInMemory({});
	const { value: id } = await lix.db
		.selectFrom("key_value")
		.where("key", "=", "lix_id")
		.selectAll()
		.executeTakeFirstOrThrow();

	const environment = createLsaInMemoryEnvironment();
	await environment.setLix({ id, blob: await lix.toBlob() });

	const lsa = await createServerApiHandler({ environment });

	const response = await lsa(
		new Request("http://localhost:3000/lsa/pull-v1", {
			method: "POST",
			body: JSON.stringify({
				lix_id: id,
				vector_clock: [],
			} satisfies RequestBody),
			headers: {
				"Content-Type": "application/json",
			},
		})
	);

	expect(response.status).toBe(200);
	const responseJson = await response.json();

	expect(responseJson.data).toBeDefined();
	Object.entries(responseJson.data).forEach((table) => {
		expect(table[0]).toBeDefined();
		expect(Array.isArray(table[1])).toBe(true);
	});
});