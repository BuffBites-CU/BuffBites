// app/layout.tsx
// Root layout — wraps every page in the app.
//
// This is a Server Component (no "use client") except for AuthProvider which is
// a client component — wrap children inside <AuthProvider> here.
//
// Structure rendered:
//   <html lang="en">
//     <body className="bg-surface font-sans text-brand-black">
//       <AuthProvider>
//         {children}
//         <NavBar />          ← fixed bottom tab bar, always visible
//       </AuthProvider>
//     </body>
//   </html>
//
// NavBar is rendered at root layout level so it persists across page navigations
// without remounting (no flash / layout shift between routes).
//
// Add Inter font via next/font/google — apply as a CSS variable so Tailwind
// can use it via `font-sans`.
//
// Metadata:
//   title: "BuffBites"
//   description: "AI-powered dining hall combo discovery for CU Boulder"
