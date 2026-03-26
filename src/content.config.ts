import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const members = defineCollection({
  loader: glob({ pattern: "**/*.json", base: "./src/content/members" }),
  schema: z.object({
    name: z.string(),
    role: z.string(),
    bio: z.string().optional(),
  }),
});

const blogs = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/blogs" }),
  schema: z.object({
    title: z.string(),
    date: z.date(),
    author: z.string().optional(),
    cover: z.string().optional(),
    description: z.string().optional(),
    tags: z.array(z.string()).default([]),
  }),
});

const news = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/news" }),
  schema: z.object({
    title: z.string(),
    date: z.date(),
    cover: z.string().optional(),
    description: z.string().optional(),
  }),
});

export const collections = {
  members,
  blogs,
  news,
};