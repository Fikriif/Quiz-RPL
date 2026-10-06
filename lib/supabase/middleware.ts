import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://tryrsqhcjvyrbjtmscym.supabase.co';
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  // Helper to create redirect response while preserving cookies set by Supabase
  const createRedirect = (targetPath: string, searchParams?: Record<string, string>) => {
    const url = request.nextUrl.clone();
    url.pathname = targetPath;
    url.search = '';
    if (searchParams) {
      Object.entries(searchParams).forEach(([k, v]) => url.searchParams.set(k, v));
    }
    const redirectResponse = NextResponse.redirect(url);
    // Forward any session cookies that Supabase might have updated
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie.name, cookie.value, cookie);
    });
    return redirectResponse;
  };

  // Refresh auth token and get user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  let userRole: string | null = null;

  if (user) {
    // 1. Check user metadata first (fastest)
    userRole = (user.user_metadata?.role as string) || null;

    // 2. If not found in metadata, query profiles table
    if (!userRole) {
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .maybeSingle();

        if (profile?.role) {
          userRole = profile.role;
        }
      } catch (err) {
        console.error('Middleware profile lookup error:', err);
      }
    }

    // Default to student if still undefined
    if (!userRole) {
      userRole = 'student';
    }
  }

  // 1. Protect Teacher Routes (/teacher/*)
  if (path.startsWith('/teacher')) {
    if (!user) {
      return createRedirect('/login', { redirect: path });
    }
    if (userRole !== 'teacher') {
      // Logged in as student trying to access teacher area -> redirect to student dashboard
      return createRedirect('/student/dashboard');
    }
  }

  // 2. Protect Student Routes (/student/*)
  if (path.startsWith('/student')) {
    if (!user) {
      return createRedirect('/login', { redirect: path });
    }
    if (userRole !== 'student') {
      // Logged in as teacher trying to access student area -> redirect to teacher dashboard
      return createRedirect('/teacher/dashboard');
    }
  }

  // 3. If already logged in, redirect away from /login and /register
  if (user && (path === '/login' || path === '/register')) {
    if (userRole === 'teacher') {
      return createRedirect('/teacher/dashboard');
    } else {
      return createRedirect('/student/dashboard');
    }
  }

  return supabaseResponse;
}
