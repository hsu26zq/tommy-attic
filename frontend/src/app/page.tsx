import { redirect } from "next/navigation";

// Note-taking only: the home page goes straight to your notes (login first if needed).
export default function Home() {
  redirect("/edit");
}
