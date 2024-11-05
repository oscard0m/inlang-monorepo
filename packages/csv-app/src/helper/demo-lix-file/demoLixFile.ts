import { newLixFile, openLixInMemory } from "@lix-js/sdk";
import { plugin } from "@lix-js/plugin-csv";
import capTableCsv from "./cap-table.csv?raw";
import emailNewsletterCsv from "./email-newsletter.csv?raw";
import { confirmChanges } from "../../layouts/OpenFileLayout.tsx";

export const DEMO_CAP_TABLE_CSV_FILE_ID = "29jas9j-2sk2-cap";
export const DEMO_EMAIL_NEWSLETTER_CSV_FILE_ID = "oj20a1-40ss-email";
export const DEMO_FILE_IDS = [
	DEMO_CAP_TABLE_CSV_FILE_ID,
	DEMO_EMAIL_NEWSLETTER_CSV_FILE_ID,
];

export async function lixCsvDemoFile(): Promise<Blob> {
	const lix = await openLixInMemory({
		blob: await newLixFile(),
		providePlugins: [plugin],
	});

	await lix.db
		.insertInto("file")
		.values({
			id: DEMO_CAP_TABLE_CSV_FILE_ID,
			path: "/cap-table-example.csv",
			data: new TextEncoder().encode(capTableCsv),
			// @ts-expect-error - insert expects stringified json
			metadata: JSON.stringify({
				unique_column: "Stakeholder",
			}),
		})
		.execute();

	await lix.settled();

	await lix.db
		.insertInto("file")
		.values({
			id: DEMO_EMAIL_NEWSLETTER_CSV_FILE_ID,
			path: "/email-newsletter.csv",
			data: new TextEncoder().encode(emailNewsletterCsv),
			// @ts-expect-error - insert expects stringified json
			metadata: JSON.stringify({
				unique_column: "email",
			}),
		})
		.execute();

	const changes = await lix.db.selectFrom("change").selectAll().execute();

	// confirm them to set the change counter to 0
	// when opening the file in the editor for the
	// first time.
	await confirmChanges(lix, changes);

	return await lix.toBlob();
}