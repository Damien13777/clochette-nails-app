/**
 * /admin/photos — redirect vers la première section.
 */

import { redirect } from "next/navigation";

export default function PhotosIndexPage() {
  redirect("/admin/photos/site");
}
