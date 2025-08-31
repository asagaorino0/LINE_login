export default function SignIn() {
  return (
    <main className="min-h-screen grid place-items-center">
      <div className="space-y-3 text-center">
        <h1 className="text-xl font-semibold">サインイン</h1>
        {/* ここに認証UI（NextAuth/Clerk/Supabase等）を置く */}
        <p className="text-gray-600">認証UIをまだ繋いでいない場合のプレースホルダーです。</p>
      </div>
    </main>
  );
}
