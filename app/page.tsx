import Home from "./Home";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// import Home from './HomeClient'; // ← こちらは 'use client' のファイル

export default function Page() {
  return <Home />;
}
