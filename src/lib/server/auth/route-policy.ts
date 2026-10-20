export type RouteIdentity = { role: string } | null;

export type RouteDecision = { redirectTo: string } | { allow: true };

export const authorizePath = (
  pathname: string,
  user: RouteIdentity
): RouteDecision => {
  if (pathname === '/login' && user) return { redirectTo: '/' };
  if (
    pathname === '/' ||
    pathname.startsWith('/tasks') ||
    pathname.startsWith('/approvals') ||
    pathname.startsWith('/my-work') ||
    pathname.startsWith('/reports') ||
    pathname.startsWith('/admin/accounts') ||
    pathname.startsWith('/account/password')
  ) {
    if (!user) return { redirectTo: '/login' };
  }
  if (pathname.startsWith('/admin/accounts') && user?.role !== 'ADMIN') {
    return { redirectTo: '/' };
  }
  return { allow: true };
};
