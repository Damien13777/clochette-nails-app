import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { deleteBlogPost } from "@/lib/actions/blog-admin";
import { DeleteArchivedButton } from "@/components/admin/delete-archived-button";
import { BackButton } from "@/components/admin/back-button";
import { BlogForm, type BlogFormValues } from "../blog-form";

export const metadata: Metadata = {
  title: "Édition article · Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function EditBlogPostPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/admin/connexion");
  }

  const { id } = await params;
  const { from } = await searchParams;
  const backHref = from ? `/admin/blog?${from}` : "/admin/blog";
  const post = await prisma.blogPost.findUnique({ where: { id } });
  if (!post) notFound();

  const initialValues: BlogFormValues = {
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt,
    content: post.content,
    category: post.category,
    tags: post.tags.join(", "),
    metaTitle: post.metaTitle ?? "",
    metaDesc: post.metaDesc ?? "",
    coverImageAlt: post.coverImageAlt ?? "",
    coverImage: post.coverImage,
    status: post.status,
    publishedAt: post.publishedAt?.toISOString() ?? null,
  };

  return (
    <div className="max-w-[900px] px-5 lg:px-8 py-10 space-y-8">
      <BackButton fallbackHref={backHref} />

      <header>
        <p
          className="text-xs uppercase tracking-[0.22em] text-[var(--color-ink-500)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Blog · Article
        </p>
        <h1
          className="mt-3 text-[clamp(1.5rem,2.8vw,2rem)]"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          {post.title}
        </h1>
        {post.status === "PUBLISHED" && (
          <p
            className="mt-2 text-xs text-[var(--color-ink-500)]"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            <Link
              href={`/blog/${post.slug}`}
              target="_blank"
              className="text-[var(--color-violet-700)] hover:underline"
            >
              Voir sur le site public →
            </Link>
          </p>
        )}
      </header>

      <BlogForm
        mode="edit"
        postId={post.id}
        initialValues={initialValues}
        backHref={backHref}
      />

      {post.status === "ARCHIVED" && (
        <DeleteArchivedButton
          onDelete={deleteBlogPost.bind(null, post.id)}
          redirectTo={backHref}
          confirmLabel="cet article"
        />
      )}
    </div>
  );
}
