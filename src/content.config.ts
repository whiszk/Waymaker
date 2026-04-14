import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// 从 src/content/members 目录读取所有 .json
const members = defineCollection({
  loader: glob({ pattern: "**/*.json", base: "./src/content/members" }),
  schema: z.object({
    name: z.string(),
    role: z.string(),
    bio: z.string().optional(), // 个人简介 / 个人介绍
  }),
});

// Astro 识别的是各个 index.md 文件
const blogs = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/blogs" }),
  schema: z.object({
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
    title: z.string(),
    date: z.date(),
    author: z.string().optional(),
    cover: z.string().optional(),
    description: z.string().optional(),
    tags: z.array(z.string()).default([]),
  }),
});

// 新闻少了author和tag，
const news = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/news" }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      date: z.date(),
      cover: z.union([image(), z.string().url()]).optional(),
      description: z.string().optional(),
    }),
});

export const collections = {
  members,
  blogs,
  news,
};