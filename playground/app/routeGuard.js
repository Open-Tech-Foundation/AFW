/**
 * AFW Route Guard
 * This function runs before every navigation.
 * 
 * @param {Object} to - Destination route info { path, fullPath, params, query }
 * @param {Object} router - Control methods { next, redirect, replace }
 */
export default async function routeGuard(to, { next, redirect, replace }) {
  console.log('🛡️ Route Guard:', to.path);

  // 1. Simulate an async session check (e.g., API call)
  await new Promise(resolve => setTimeout(resolve, 100));

  const isAuthenticated = false; // MOCK: Assume user is not logged in

  // 2. Example: Protect the Forms Demo route
  if (to.path.startsWith('/post') && !isAuthenticated) {
    console.warn('🚫 Unauthorized access to forms-demo. Redirecting to login...');

    // Redirect to login with a return path
    redirect(`/login?redirect=${encodeURIComponent(to.fullPath)}`);
    return;
  }

  // 3. Allow navigation to proceed
  next();
}
