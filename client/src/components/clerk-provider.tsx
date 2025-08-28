import { ClerkProvider } from '@clerk/nextjs'
import { ReactNode } from 'react'
interface ClerkWrapperProps {
  children: ReactNode
}
export function ClerkWrapper({ children }: ClerkWrapperProps) {
  // 一時的にClerkを無効化し、元の認証システムを使用
  console.log('Clerk is temporarily disabled. Using fallback authentication.');
  return <>{children}</>;
}

// ///Clerk を本当に使う場合は、あとで以下のように差し替えてください：
// import { ClerkProvider } from "@clerk/clerk-react";
// const pk = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
// export const ClerkWrapper: React.FC<React.PropsWithChildren> = ({ children }) => {
//   if (!pk) return <>{children}</>; // キー未設定でもビルド可能に
//   return <ClerkProvider publishableKey={pk}>{children}</ClerkProvider>;
// };
// export default ClerkWrapper;
