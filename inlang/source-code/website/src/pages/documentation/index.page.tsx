import { For, Show, createEffect, createSignal, onMount } from "solid-js"
import { Layout as RootLayout } from "#src/pages/Layout.jsx"
import type { ProcessedTableOfContents } from "./index.page.server.jsx"
import { currentPageContext } from "#src/renderer/state.js"
import type SlDetails from "@shoelace-style/shoelace/dist/components/details/details.js"
import { Meta, Title } from "@solidjs/meta"
import { Feedback } from "./Feedback.jsx"
import { EditButton } from "./EditButton.jsx"
import { defaultLanguage } from "#src/renderer/_default.page.route.js"
import { useI18n } from "@solid-primitives/i18n"
import "@inlang/markdown/css"
import "@inlang/markdown/custom-elements"
import tableOfContents from "../../../../../documentation/tableOfContents.json"

/**
 * The page props are undefined if an error occurred during parsing of the markdown.
 */
export type PageProps = {
	processedTableOfContents: ProcessedTableOfContents
	markdown: Awaited<ReturnType<any>>
}

export function Page(props: PageProps) {
	let mobileDetailMenu: SlDetails | undefined
	const [editLink, setEditLink] = createSignal<string | undefined>("")
	const [, { locale }] = useI18n()

	const getLocale = () => {
		const language = locale() ?? defaultLanguage
		return language !== defaultLanguage ? "/" + language : ""
	}

	// const title = () => {
	// 	if (props.processedTableOfContents) {
	// 		for (const section of Object.keys(props.processedTableOfContents)) {
	// 			for (const document of props.processedTableOfContents[section]) {
	// 				if (
	// 					`/documentation/${document.slug.replace("-", "/")}` ===
	// 					currentPageContext.urlParsed.pathname
	// 				) {
	// 					return document.pageTitle
	// 				}
	// 			}
	// 		}
	// 	} else {
	// 		return "inlang Documentation"
	// 	}
	// }

	const getMetaData = (property: string) => {
		const currentPage = currentPageContext.urlParsed.pathname
			.replace(getLocale(), "")
			.replace("/documentation/", "")

		for (const section of Object.keys(props.processedTableOfContents)) {
			for (const page of props.processedTableOfContents[section]) {
				if (page.slug === currentPage || page.slug === currentPage + "/") {
					return property === "title" ? page.title : page.description
				}
			}
		}
	}

	// createEffect(() => {
	// 	if (props.markdown && props.markdown.frontmatter) {
	// 		const markdownHref = props.markdown.frontmatter.href

	// 		const files: Record<string, string[]> = {}
	// 		for (const [category, documentsArray] of Object.entries(tableOfContents)) {
	// 			const rawPaths = documentsArray.map((document) => document)
	// 			files[category] = rawPaths
	// 		}

	// 		for (const section of Object.keys(props.processedTableOfContents)) {
	// 			const documents = props.processedTableOfContents[section]

	// 			if (documents) {
	// 				for (const document of documents) {
	// 					if (document.frontmatter && document.frontmatter.href === markdownHref) {
	// 						const index = documents.indexOf(document)
	// 						const fileSource = files[section]?.[index] || undefined

	// 						const gitHubLink =
	// 							"https://github.com/inlang/monorepo/edit/main/inlang/documentation" +
	// 							"/" +
	// 							fileSource

	// 						setEditLink(gitHubLink)
	// 					}
	// 				}
	// 			}
	// 		}
	// 	}
	// })

	// const h2Headlines = () => {
	// 	const result: string[] = []
	// 	// @ts-expect-error - some type mismatch in the markdown parser
	// 	for (const child of props.markdown.renderableTree.children ?? []) {
	// 		// only render h2 as sub headlines
	// 		if (child.name === "Heading" && child.attributes.level === 2) {
	// 			result.push(child.children[0])
	// 		}
	// 	}
	// 	return result
	// }

	return (
		<>
			{/* frontmatter is undefined on first client side nav  */}
			<Title>{getMetaData("title")}</Title>
			<Meta name="description" content={getMetaData("description")} />
			<Meta name="og:image" content="/images/inlang-social-image.jpg" />
			<RootLayout>
				{/* important: the responsive breakpoints must align throughout the markup! */}
				<div class="flex flex-col grow md:grid md:grid-cols-4 gap-10 w-full">
					{/* desktop navbar */}
					{/* 
          hacking the left margins to apply bg-surface-2 with 100rem 
              (tested on an ultrawide monitor, works!) 
          */}
					<div class="hidden md:block h-full -ml-[100rem] pl-[100rem] border-r-[1px] border-surface-2">
						<nav class="sticky top-12 max-h-[96vh] overflow-y-scroll overflow-scrollbar">
							{/* `Show` is a hotfix when client side rendering loaded this page
							 * filteredTableContents is not available on the client.
							 */}
							<div class="py-14 pr-8">
								<Show when={props.processedTableOfContents}>
									<NavbarCommon
										{...props}
										// h2Headlines={h2Headlines()}
										getLocale={getLocale}
									/>
								</Show>
							</div>
						</nav>
					</div>
					{/* Mobile navbar */}
					<nav class="fixed min-w-full z-10 -translate-x-4 sm:-translate-x-10 sm:px-6 md:hidden overflow-y-scroll overflow-auto backdrop-blur-sm">
						<sl-details ref={mobileDetailMenu}>
							<h3 slot="summary" class="font-medium">
								Menu
							</h3>
							{/* `Show` is a hotfix when client side rendering loaded this page
							 * filteredTableContents is not available on the client.
							 */}
							<Show when={props.processedTableOfContents}>
								<NavbarCommon
									{...props}
									// h2Headlines={h2Headlines()}
									onLinkClick={() => {
										mobileDetailMenu?.hide()
									}}
									getLocale={getLocale}
								/>
							</Show>
						</sl-details>
					</nav>
					<Show when={props.markdown} fallback={<p class="text-danger">{props.markdown?.error}</p>}>
						{/* 
            rendering on the website is broken due to relative paths and 
            the escaping of html. it is better to show the RFC's on the website
            and refer to github for the rendered version than to not show them at all. 
          */}
						<div class="w-full justify-self-center mb-8 md:p-6 md:col-span-3">
							<Show when={currentPageContext.urlParsed.pathname.includes("rfc")}>
								{/* <Callout variant="warning">
									<p>
										The rendering of RFCs on the website might be broken.{" "}
										<a href="https://github.com/inlang/inlang/tree/main/rfcs" target="_blank">
											Read the RFC on GitHub instead.
										</a>
									</p>
								</Callout> */}
							</Show>
							<div
								// change the col-span to 2 if a right side nav bar should be rendered
								class="w-full justify-self-center md:col-span-3"
							>
								<article>
									<div innerHTML={props.markdown} />
								</article>
								<EditButton href={editLink()} />
								<Feedback />
							</div>
						</div>
					</Show>
				</div>
			</RootLayout>
		</>
	)
}

function NavbarCommon(props: {
	processedTableOfContents: PageProps["processedTableOfContents"]
	// h2Headlines: string[]
	onLinkClick?: () => void
	getLocale?: () => string
}) {
	const [highlightedAnchor, setHighlightedAnchor] = createSignal<string | undefined>("")

	const isSelected = (slug: string) => {
		if (
			`/documentation/${slug}` ===
				currentPageContext.urlParsed.pathname.replace(props.getLocale(), "") ||
			`/documentation/${slug}` ===
				currentPageContext.urlParsed.pathname.replace(props.getLocale(), "") + "/"
		) {
			return true
		} else {
			return false
		}
	}

	const onAnchorClick = (anchor: string) => {
		setHighlightedAnchor(anchor)
	}

	// onMount(() => {
	// 	if (
	// 		currentPageContext.urlParsed.hash &&
	// 		props.h2Headlines
	// 			.toString()
	// 			.toLowerCase()
	// 			.replaceAll(" ", "-")
	// 			// @ts-expect-error - fix after refactoring
	// 			.includes(currentPageContext.urlParsed.hash?.replace("#", ""))
	// 	) {
	// 		// @ts-expect-error - fix after refactoring
	// 		setHighlightedAnchor(currentPageContext.urlParsed.hash?.replace("#", ""))

	// 		const targetElement = document.getElementById(
	// 			// @ts-expect-error - fix after refactoring
	// 			currentPageContext.urlParsed.hash?.replace("#", ""),
	// 		)

	// 		checkLoadedImgs(() => {
	// 			const elementRect = targetElement!.getBoundingClientRect()
	// 			const offsetPosition = elementRect.top - 96 // The offset because of the fixed navbar

	// 			window.scrollBy({
	// 				top: offsetPosition,
	// 			})
	// 		})
	// 	}
	// })

	return (
		<ul role="list" class="w-full space-y-3">
			<For each={Object.keys(props.processedTableOfContents)}>
				{(category) => (
					<li>
						<h2 class="tracking-wide pt-2 text font-semibold text-on-surface pb-2">{category}</h2>
						<ul class="space-y-2" role="list">
							<For
								each={
									props.processedTableOfContents[
										category as keyof typeof props.processedTableOfContents
									]
								}
							>
								{(page) => (
									<li>
										<a
											onClick={props.onLinkClick}
											class={
												(isSelected(page.slug)
													? "text-primary font-semibold "
													: "text-info/80 hover:text-on-background ") +
												"tracking-wide text-sm block w-full font-normal"
											}
											href={props.getLocale() + `/documentation/${page.slug}`}
										>
											{page.title}
										</a>
									</li>
								)}
							</For>
						</ul>
					</li>
				)}
			</For>

			{/* <For each={Object.keys(props.processedTableOfContents)}>
				{(category) => (
					<li class="">
						<h2 class="tracking-wide pt-2 text font-semibold text-on-surface pb-2">{category}</h2>
						<ul class="space-y-2" role="list">
							<For
								each={
									props.processedTableOfContents[
										category as keyof typeof props.processedTableOfContents
									]
								}
							>
								{(document) => (
									<li>
										<a
											onClick={props.onLinkClick}
											class={
												(isSelected(document.slug)
													? "text-primary font-semibold "
													: "text-info/80 hover:text-on-background ") +
												"tracking-wide text-sm block w-full font-normal"
											}
											href={getLocale() + `/documentation/${document.slug.replace("-", "/")}`}
										>
											{document.pageTitle}
										</a>
										<Show
											when={
												category !== "Startpage" &&
												document.anchors.length > 0 &&
												isSelected(document.slug)
											}
										>
											<ul class="my-2">
												<For each={document.anchors}>
													{(heading) => (
														<Show when={!heading.includes(document.pageTitle)}>
															<li>
																<a
																	onClick={() => {
																		onAnchorClick(
																			heading.toString().toLowerCase().replaceAll(" ", "-"),
																		)
																		props.onLinkClick?.()
																	}}
																	class={
																		"text-sm tracking-widem block w-full border-l pl-3 py-1 hover:border-l-info/80 " +
																		(highlightedAnchor() ===
																		heading.toString().toLowerCase().replaceAll(" ", "-")
																			? "font-medium text-on-background border-l-text-on-background "
																			: "text-info/80 hover:text-on-background font-normal border-l-info/20 ")
																	}
																	href={`#${heading
																		.toString()
																		.toLowerCase()
																		.replaceAll(" ", "-")
																		.replaceAll("/", "")}`}
																>
																	{heading}
																</a>
															</li>
														</Show>
													)}
												</For>
											</ul>
										</Show>
									</li>
								)}
							</For>
						</ul>
					</li>
				)}
			</For> */}
		</ul>
	)
}

function checkLoadedImgs(anchorScroll: () => void) {
	let imgElementsLoaded = 0
	const imgElements = document.querySelectorAll("img")
	const imgElementsLength = imgElements.length

	if (imgElementsLength === 0) {
		anchorScroll()
	} else {
		for (const img of imgElements) {
			if (img.complete) {
				imgElementsLoaded++
				if (imgElementsLoaded === imgElementsLength) {
					anchorScroll()
				}
			} else {
				img.addEventListener("load", () => {
					imgElementsLoaded++
					if (imgElementsLoaded === imgElementsLength) {
						anchorScroll()
					}
				})
			}
		}
	}
}
