import { currentPageContext } from "#src/renderer/state.js"
import {
	createContext,
	createEffect,
	createResource,
	createSignal,
	from,
	JSXElement,
	Resource,
	Setter,
	useContext,
} from "solid-js"
import type { EditorRouteParams, EditorSearchParams } from "./types.js"
import type { LocalStorageSchema } from "#src/services/local-storage/index.js"
import { useLocalStorage } from "#src/services/local-storage/index.js"
import { github } from "#src/services/github/index.js"
import { showToast } from "#src/components/Toast.jsx"
import type { TourStepId } from "./components/Notification/TourHintWrapper.jsx"
import { setSearchParams } from "./helper/setSearchParams.js"
import { telemetryBrowser, parseOrigin } from "@inlang/telemetry"
import type { NodeishFilesystem } from "@inlang-git/fs"
import { createNodeishMemoryFs } from "@inlang-git/fs"
import { http, raw } from "@inlang-git/client/raw"
import { publicEnv } from "@inlang/env-variables"
import {
	LanguageTag,
	LintRule,
	Result,
	openInlangProject,
	withSolidReactivity,
	type SolidInlangProject,
	type Message,
} from "@inlang/app"
import type { InlangModule } from "@inlang/module"
import pluginJson from "../../../../../../../plugins/json/dist/index.js"
import pluginLint from "../../../../../../../plugins/standard-lint-rules/dist/index.js"

type EditorStateSchema = {
	/**
	 * Whether a repository is cloned and when it was cloned.
	 *
	 * The value is `false` if the repository is not cloned. Otherwise,
	 * a Date is provided that reflects the time of when the repository
	 * was cloned.
	 */
	repositoryIsCloned: Resource<undefined | Date>
	/**
	 * The current branch.
	 */
	currentBranch: Resource<string | undefined>
	/**
	 * Unpushed changes in the repository.
	 */
	unpushedChanges: Resource<Awaited<ReturnType<typeof raw.log>>>
	/**
	 * Additional information about a repository provided by GitHub.
	 */
	githubRepositoryInformation: Resource<
		Awaited<ReturnType<typeof github.request<"GET /repos/{owner}/{repo}">>>
	>
	/**
	 * Route parameters like `/github.com/inlang/website`.
	 *
	 * Utility to access the route parameters in a typesafe manner.
	 */
	routeParams: () => EditorRouteParams

	/**
	 * Search parameters of editor route like `?branch=main`.
	 *
	 * Utility to access the route parameters in a typesafe manner.
	 */
	searchParams: () => EditorSearchParams

	/**
	 * Virtual filesystem
	 */
	fs: () => NodeishFilesystem

	/**
	 * Id to filter messages
	 */
	filteredId: () => string
	setFilteredId: Setter<string>

	/**
	 * TextSearch to filter messages
	 */
	textSearch: () => string
	setTextSearch: Setter<string>

	/**
	 * The filesystem is not reactive, hence setFsChange to manually
	 * trigger re-renders.
	 *
	 * setFsChange manually to `Date.now()`
	 */
	fsChange: () => Date
	setFsChange: Setter<Date>

	/**
	 * The current inlang config.
	 *
	 * Undefined if no inlang config exists/has been found.
	 */
	inlang: Resource<SolidInlangProject | undefined>

	doesInlangConfigExist: () => boolean

	sourceLanguageTag: () => LanguageTag | undefined

	languageTags: () => LanguageTag[]
	setLanguageTags: Setter<LanguageTag[]>

	tourStep: () => TourStepId
	setTourStep: Setter<TourStepId>

	/**
	 * FilterLanguages show or hide the different messages.
	 */
	filteredLanguageTags: () => LanguageTag[]
	setFilteredLanguageTags: Setter<LanguageTag[]>

	/**
	 * Filtered lint rules.
	 */
	filteredLintRules: () => LintRule["meta"]["id"][]
	setFilteredLintRules: Setter<LintRule["meta"]["id"][]>

	/**
	 * Unpushed changes in the repository.
	 */

	localChanges: () => number // Message[]
	setLocalChanges: Setter<number> // Setter<Message[]>

	/**
	 * The reference resource.
	 */
	sourceMessages: () => Message[] | undefined

	/**
	 * Whether the user is a collaborator of the repository.
	 *
	 * Check whether the user is logged in before using this resource.
	 * Otherwise, the resource might throw an error.
	 *
	 * @example
	 * 	if (user && isCollaborator())
	 */
	userIsCollaborator: Resource<boolean>

	/**
	 * Whether the is private or not.
	 */
	repoIsPrivate: Resource<boolean | undefined>

	/**
	 * The last time the repository was pushed.
	 */
	setLastPush: Setter<Date | undefined>

	/**
	 * The last time the repository has been pulled.
	 */
	lastPullTime: () => Date | undefined
	setLastPullTime: Setter<Date | undefined>
}

const EditorStateContext = createContext<EditorStateSchema>()

export const useEditorState = () => {
	const context = useContext(EditorStateContext)
	if (context === undefined) {
		throw Error(
			"The EditorStateContext is undefined. useEditorState must be used within a EditorStateProvider",
		)
	}
	return context
}

/**
 * `<EditorStateProvider>` initializes state with a computations such resources.
 *
 * See https://www.solidjs.com/tutorial/stores_context.
 */
export function EditorStateProvider(props: { children: JSXElement }) {
	/**
	 *  Date of the last push to the Repo
	 */
	const [lastPush, setLastPush] = createSignal<Date>()

	const [localChanges, setLocalChanges] = createSignal<number>(0)

	const routeParams = () => currentPageContext.routeParams as EditorRouteParams

	const searchParams = () => currentPageContext.urlParsed.search as EditorSearchParams

	const [fsChange, setFsChange] = createSignal(new Date())

	const [doesInlangConfigExist, setDoesInlangConfigExist] = createSignal<boolean>(false)
	const [sourceLanguageTag, setSourceLanguageTag] = createSignal<LanguageTag>()
	const [languageTags, setLanguageTags] = createSignal<LanguageTag[]>([])
	const [tourStep, setTourStep] = createSignal<TourStepId>("github-login")

	//set filter with search params
	const params = new URL(document.URL).searchParams

	const [filteredId, setFilteredId] = createSignal<string>((params.get("id") || "") as string)
	createEffect(() => {
		setSearchParams({ key: "id", value: filteredId() })
	})

	const [textSearch, setTextSearch] = createSignal<string>((params.get("search") || "") as string)
	createEffect(() => {
		setSearchParams({ key: "search", value: textSearch() })
	})

	const [filteredLanguageTags, setFilteredLanguageTags] = createSignal<LanguageTag[]>(
		params.getAll("lang") as string[],
	)
	createEffect(() => {
		setSearchParams({ key: "lang", value: filteredLanguageTags() })
	})

	const [filteredLintRules, setFilteredLintRules] = createSignal<LintRule["meta"]["id"][]>(
		params.getAll("lint") as LintRule["meta"]["id"][],
	)
	createEffect(() => {
		setSearchParams({ key: "lint", value: filteredLintRules() })
	})

	const [fs, setFs] = createSignal<NodeishFilesystem>(createNodeishMemoryFs())

	/**
	 * The reference resource.
	 */
	const sourceMessages = () =>
		inlang()
			?.query.messages.getAll()
			.filter((message) =>
				message.variants.filter((variant) => variant.languageTag === sourceLanguageTag()),
			)

	const [localStorage] = useLocalStorage() ?? []

	// re-fetched if currentPageContext changes
	const [repositoryIsCloned] = createResource(
		() => {
			// re-initialize fs on every cloneRepository call
			// until subdirectories are supported
			setFs(createNodeishMemoryFs())
			return {
				fs: fs(),
				routeParams: currentPageContext.routeParams as EditorRouteParams,
				user: localStorage?.user,
				setFsChange,
			}
		},
		async (args) => {
			const result = await cloneRepository(args)
			// not blocking the execution by using the callback pattern
			// the user does not need to wait for the response
			// checks whether the gitOrigin corresponds to the pattern.

			const gitOrigin = parseOrigin({ remotes: await getGitOrigin(args) })
			//You must include at least one group property for a group to be visible in the "Persons & Groups" tab
			//https://posthog.com/docs/product-analytics/group-analytics#setting-and-updating-group-properties
			telemetryBrowser.group("repository", gitOrigin, {
				name: gitOrigin,
			})
			github
				.request("GET /repos/{owner}/{repo}", {
					owner: args.routeParams.owner,
					repo: args.routeParams.repository,
				})
				.then((response) => {
					telemetryBrowser.group("repository", gitOrigin, {
						visibility: response.data.private ? "Private" : "Public",
						isFork: response.data.fork ? "Fork" : "isNotFork",
						// parseOrgin requiers a "remote"="origing" to transform the url in the git origin
						parentGitOrigin: response.data.parent?.git_url
							? parseOrigin({ remotes: [{ remote: "origin", url: response.data.parent.git_url }] })
							: "",
					})
					telemetryBrowser.capture("EDITOR cloned repository", {
						owner: args.routeParams.owner,
						repository: args.routeParams.repository,
						userPermission: userIsCollaborator() ? "iscollaborator" : "isNotCollaborator",
					})
				})
				.catch((error) => {
					telemetryBrowser.capture("EDITOR cloned repository", {
						owner: args.routeParams.owner,
						repository: args.routeParams.repository,
						errorDuringIsPrivateRequest: error,
						userPermission: userIsCollaborator() ? "collaborator" : "contributor",
					})
				})

			return result
		},
	)

	const [inlang] = createResource(
		() => {
			if (
				repositoryIsCloned.error ||
				repositoryIsCloned.loading ||
				repositoryIsCloned() === undefined
			) {
				return false
			}
			return {
				fs: fs(),
				// BUG: this is not reactive
				// See https://github.com/inlang/inlang/issues/838#issuecomment-1560745678
				// we need to listen to inlang.config.js changes
				// lastFsChange: fsChange(),
			}
		},
		async () => {
			const inlang = withSolidReactivity(
				await openInlangProject({
					configPath: "./inlang.config.json",
					nodeishFs: fs(),
					_import: async () =>
						({
							default: {
								// @ts-ignore
								plugins: [...pluginJson.plugins],
								// @ts-ignore
								lintRules: [...pluginLint.lintRules],
							},
						} satisfies InlangModule),
				}),
				{ from },
			)
			const config = inlang.config()
			if (config) {
				const languagesTags = // TODO: move this into setter logic
					config.languageTags.sort((a: any, b: any) =>
						// source language should be first
						// sort alphabetically otherwise
						a === config.sourceLanguageTag
							? -1
							: b === config.sourceLanguageTag
							? 1
							: a.localeCompare(b),
					) || []
				// initializes the languages to all languages
				setDoesInlangConfigExist(true)
				setSourceLanguageTag(config.sourceLanguageTag)
				setLanguageTags(languagesTags)
				await inlang.lint.init()
			}
			return inlang
		},
	)

	//the effect should skip tour guide steps if not needed
	createEffect(() => {
		if (localStorage?.user === undefined) {
			setTourStep("github-login")
		} else if (!userIsCollaborator()) {
			setTourStep("fork-repository")
		} else if (tourStep() === "fork-repository" && inlang()) {
			setTimeout(() => {
				const element = document.getElementById("missingTranslation-summary")
				element !== null ? setTourStep("missing-message-rule") : setTourStep("textfield")
			}, 100)
		} else if (tourStep() === "missing-message-rule" && inlang()) {
			setTimeout(() => {
				const element = document.getElementById("missingTranslation-summary")
				element !== null ? setTourStep("missing-message-rule") : setTourStep("textfield")
			}, 100)
		}
	})

	// re-fetched if the file system changes
	const [unpushedChanges] = createResource(() => {
		if (
			repositoryIsCloned.error ||
			repositoryIsCloned.loading ||
			repositoryIsCloned() === undefined
		) {
			return false
		}
		return {
			fs: fs(),
			repositoryClonedTime: repositoryIsCloned()!,
			lastPushTime: lastPush(),
			lastPullTime: lastPullTime(),
			// while unpushed changes does not require last fs change,
			// unpushed changed should react to fsChange. Hence, pass
			// the signal to _unpushedChanges
			lastFsChange: fsChange(),
		}
	}, _unpushedChanges)

	const [repoIsPrivate] = createResource(
		/**
		 * createResource is not reacting to changes like: "false","Null", or "undefined".
		 * Hence, a string needs to be passed to the fetch of the resource.
		 */
		() => {
			if (
				currentPageContext.routeParams.owner === undefined ||
				currentPageContext.routeParams.repository === undefined
			) {
				return false
			}
			return {
				routeParams: currentPageContext.routeParams as EditorRouteParams,
			}
		},
		async (args) => {
			try {
				const response = await github.request("GET /repos/{owner}/{repo}", {
					owner: args.routeParams.owner,
					repo: args.routeParams.repository,
				})
				return response.data.private
			} catch (error) {
				return undefined
			}
		},
	)

	const [userIsCollaborator] = createResource(
		/**
		 * createResource is not reacting to changes like: "false","Null", or "undefined".
		 * Hence, a string needs to be passed to the fetch of the resource.
		 */
		() => {
			// do not fetch if no owner or repository is given
			// can happen if the user navigated away from the editor
			if (
				currentPageContext.routeParams.owner === undefined ||
				currentPageContext.routeParams.repository === undefined
			) {
				return false
			}
			return {
				user: localStorage?.user ?? "not logged in",
				routeParams: currentPageContext.routeParams as EditorRouteParams,
			}
		},
		async (args) => {
			// user is not logged in, see the returned object above
			if (typeof args.user === "string") {
				return false
			}
			try {
				const response = await github.request(
					"GET /repos/{owner}/{repo}/collaborators/{username}",
					{
						owner: args.routeParams.owner,
						repo: args.routeParams.repository,
						username: args.user.username,
					},
				)
				return response.status === 204 ? true : false
			} catch (error) {
				// the user is not a collaborator, hence the request will fail
				return false
			}
		},
	)

	const [githubRepositoryInformation] = createResource(
		() => {
			if (
				localStorage?.user === undefined ||
				routeParams().owner === undefined ||
				routeParams().repository === undefined
			) {
				return false
			}
			return {
				user: localStorage.user,
				routeParams: routeParams(),
			}
		},
		async (args) =>
			github.request("GET /repos/{owner}/{repo}", {
				owner: args.routeParams.owner,
				repo: args.routeParams.repository,
			}),
	)

	const [currentBranch] = createResource(
		() => {
			if (
				repositoryIsCloned.error ||
				repositoryIsCloned.loading ||
				repositoryIsCloned() === undefined
			) {
				return false
			}
			return {
				fs: fs(),
			}
		},
		async (args) => {
			const branch = await raw.currentBranch({
				fs: args.fs,
				dir: "/",
			})
			return branch ?? undefined
		},
	)

	// syncing a forked repository
	//
	// If a repository is a fork, it needs to be synced with the upstream repository.
	// This is done by merging the upstream repository into the forked repository.
	//
	// https://github.com/inlang/inlang/issues/326
	//
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const [maybeSyncForkOnClone] = createResource(
		() => {
			if (
				(githubRepositoryInformation() && githubRepositoryInformation()?.data.fork !== true) ||
				currentBranch() === undefined ||
				localStorage.user === undefined ||
				// route params can be undefined if the user navigated away from the editor
				routeParams().owner === undefined ||
				routeParams().repository === undefined
			) {
				return false
			}
			// pass all reactive variables
			return {
				branch: currentBranch()!,
				owner: routeParams().owner,
				repo: routeParams().repository,
				fs: fs(),
				setFsChange: setFsChange,
				user: localStorage.user,
			}
		},
		async (args) => {
			try {
				// merge upstream
				const response = await github.request("POST /repos/{owner}/{repo}/merge-upstream", {
					branch: args.branch,
					owner: args.owner,
					repo: args.repo,
				})
				if (response.data.merge_type && response.data.merge_type !== "none") {
					showToast({
						variant: "info",
						title: "Synced fork",
						message:
							"The fork has been synced with its parent repository. The latest changes will be pulled.",
					})
					// pull afterwards
					await pull({ setLastPullTime, ...args })
				}
			} catch (error) {
				showToast({
					variant: "warning",
					title: "Syncing fork failed",
					message:
						"The fork likely has outstanding changes that have not been merged and led to a merge conflict. You can resolve the merge conflict manually by opening your GitHub repository.",
				})
				// rethrow for resource.error to work
				throw error
			}
		},
	)

	const [lastPullTime, setLastPullTime] = createSignal<Date>()

	return (
		<EditorStateContext.Provider
			value={
				{
					repositoryIsCloned,
					currentBranch,
					unpushedChanges,
					githubRepositoryInformation,
					routeParams,
					searchParams,
					filteredId,
					setFilteredId,
					textSearch,
					setTextSearch,
					fsChange,
					setFsChange,
					inlang,
					doesInlangConfigExist,
					sourceLanguageTag,
					languageTags,
					setLanguageTags,
					tourStep,
					setTourStep,
					filteredLanguageTags,
					setFilteredLanguageTags,
					filteredLintRules,
					setFilteredLintRules,
					localChanges,
					setLocalChanges,
					sourceMessages,
					userIsCollaborator,
					repoIsPrivate,
					setLastPush,
					lastPullTime,
					setLastPullTime,
					fs,
				} satisfies EditorStateSchema
			}
		>
			{props.children}
		</EditorStateContext.Provider>
	)
}

// ------------------------------------------

async function cloneRepository(args: {
	fs: NodeishFilesystem
	routeParams: EditorRouteParams
	user: LocalStorageSchema["user"]
	setFsChange: (date: Date) => void
}): Promise<Date | undefined> {
	const { host, owner, repository } = args.routeParams
	if (host === undefined || owner === undefined || repository === undefined) {
		return undefined
	}

	// do shallow clone, get first commit and just one branch
	await raw.clone({
		fs: args.fs,
		http,
		dir: "/",
		corsProxy: publicEnv.PUBLIC_GIT_PROXY_PATH,
		url: `https://${host}/${owner}/${repository}`,
		singleBranch: true,
		depth: 1,
	})

	// fetch 100 more commits, can get more commits if needed
	// https://isomorphic-git.org/docs/en/faq#how-to-make-a-shallow-repository-unshallow
	raw.fetch({
		fs: args.fs,
		http,
		dir: "/",
		// corsProxy: clientSideEnv.VITE_GIT_REQUEST_PROXY_PATH,
		url: `https://${host}/${owner}/${repository}`,
		depth: 100,
		relative: true,
	})

	// triggering a side effect here to trigger a re-render
	// of components that depends on fs
	const date = new Date()
	args.setFsChange(date)
	return date
}

export class PullException extends Error {
	readonly #id = "PullException"
}

export class PushException extends Error {
	readonly #id = "PushException"
}

export class UnknownException extends Error {
	readonly #id = "UnknownException"

	constructor(readonly id: string) {
		super(id)
	}
}

/**
 * Pushed changes and pulls right afterwards.
 */
export async function pushChanges(args: {
	fs: NodeishFilesystem
	routeParams: EditorRouteParams
	user: NonNullable<LocalStorageSchema["user"]>
	setFsChange: (date: Date) => void
	setLastPush: (date: Date) => void
	setLastPullTime: (date: Date) => void
}): Promise<Result<true, PushException | PullException>> {
	const { host, owner, repository } = args.routeParams
	if (host === undefined || owner === undefined || repository === undefined) {
		return { error: new PushException("Invalid route params") }
	}
	// stage all changes
	const status = await raw.statusMatrix({
		fs: args.fs,
		dir: "/",
		filter: (f: any) =>
			f.endsWith(".json") ||
			f.endsWith(".po") ||
			f.endsWith(".yaml") ||
			f.endsWith(".yml") ||
			f.endsWith(".js") ||
			f.endsWith(".ts"),
	})
	const filesWithUncommittedChanges = status.filter(
		(row: any) =>
			// files with unstaged and uncommitted changes
			(row[2] === 2 && row[3] === 1) ||
			// added files
			(row[2] === 2 && row[3] === 0),
	)
	if (filesWithUncommittedChanges.length === 0) {
		return { error: new PushException("No changes to push") }
	}
	// add all changes
	for (const file of filesWithUncommittedChanges) {
		await raw.add({ fs: args.fs, dir: "/", filepath: file[0] })
	}
	// commit changes
	await raw.commit({
		fs: args.fs,
		dir: "/",
		author: {
			name: args.user.username,
			email: args.user.email,
		},
		message: "inlang: update translations",
	})
	// triggering a side effect here to trigger a re-render
	// of components that depends on fs
	args.setFsChange(new Date())
	// push changes
	const requestArgs = {
		fs: args.fs,
		http,
		dir: "/",
		author: {
			name: args.user.username,
		},
		corsProxy: publicEnv.PUBLIC_GIT_PROXY_PATH,
		url: `https://${host}/${owner}/${repository}`,
	}
	try {
		// pull changes before pushing
		// https://github.com/inlang/inlang/issues/250
		const pullResult = await pull(args)
		if (pullResult.error !== undefined) {
			return { error: pullResult.error }
		}
		const push = await raw.push(requestArgs)
		if (push.ok === false) {
			return { error: new PushException("Failed to push", { cause: push.error }) }
		}
		await raw.pull(requestArgs)
		const time = new Date()
		// triggering a rebuild of everything fs related
		args.setFsChange(time)
		args.setLastPush(time)
		return { data: true }
	} catch (error) {
		return { error: (error as PushException) ?? "Unknown error" }
	}
}

async function _unpushedChanges(args: {
	fs: NodeishFilesystem
	repositoryClonedTime: Date
	lastPushTime?: Date
	lastPullTime?: Date
}) {
	if (args.repositoryClonedTime === undefined) {
		return []
	}
	// filter out undefined values and sort by date
	// get the last event
	const lastRelevantEvent = [args.lastPushTime, args.repositoryClonedTime, args.lastPullTime]
		.filter((value) => value !== undefined)
		.sort((a, b) => a!.getTime() - b!.getTime())
		.at(-1)

	const unpushedChanges = await raw.log({
		fs: args.fs,
		dir: "/",
		since: lastRelevantEvent,
	})
	return unpushedChanges
}

async function pull(args: {
	fs: NodeishFilesystem
	user: LocalStorageSchema["user"]
	setFsChange: (date: Date) => void
	setLastPullTime: (date: Date) => void
}): Promise<Result<true, PullException>> {
	try {
		await raw.pull({
			fs: args.fs,
			http,
			dir: "/",
			corsProxy: publicEnv.PUBLIC_GIT_PROXY_PATH,
			singleBranch: true,
			author: {
				name: args.user?.username,
			},
			// try to not create a merge commit
			// rebasing would be the best option but it is not supported by isomorphic-git
			// a switch to https://libgit2.org/ seems unavoidable
			fastForward: true,
		})
		const time = new Date()
		// triggering a rebuild of everything fs related
		args.setFsChange(time)
		args.setLastPullTime(time)
		return { data: true }
	} catch (error) {
		return { error: error as PullException }
	}
}
async function getGitOrigin(args: { fs: NodeishFilesystem }) {
	try {
		const remotes = await raw.listRemotes({
			fs: args.fs,
			dir: await raw.findRoot({ fs: args.fs, filepath: "/" }),
		})
		return remotes
	} catch (e) {
		return undefined
	}
}
