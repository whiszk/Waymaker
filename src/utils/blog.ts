import type { CollectionEntry } from "astro:content";

const CLEAN_SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;


// 校验博客属性中的slug是否合法，如果不合法，就用目录名兜底
export function getBlogSlug(blog: CollectionEntry<"blogs">): string {
    const configuredSlug = blog.data.slug?.trim();
    if (configuredSlug) {
        if (!CLEAN_SLUG_REGEX.test(configuredSlug)) {
            throw new Error(
                `Blog "${blog.id}" has invalid slug "${configuredSlug}". Use lowercase letters, numbers, and hyphens.`
            );
        }

        return configuredSlug;
    }

    const normalizedId = blog.id.replace(/\\/g, "/").replace(/\/index$/, "");
    const fallbackSlug = normalizedId.split("/").filter(Boolean).pop() ?? "";

    if (!CLEAN_SLUG_REGEX.test(fallbackSlug)) {
        throw new Error(
            `Blog "${blog.id}" is missing a clean slug. Set frontmatter "slug" or rename folder to kebab-case.`
        );
    }

    return fallbackSlug;
}

// slug去重
export function assertUniqueBlogSlugs(blogs: CollectionEntry<"blogs">[]): void {
    const usedSlugs = new Map<string, string>();

    for (const blog of blogs) {
        const slug = getBlogSlug(blog);
        const existingId = usedSlugs.get(slug);

        if (existingId) {
            throw new Error(
                `Duplicate blog slug "${slug}" found in "${existingId}" and "${blog.id}".`
            );
        }

        usedSlugs.set(slug, blog.id);
    }
}