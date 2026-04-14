export function normalizeBasePath(rawValue) {
    if (rawValue === undefined || rawValue === null) {
        return '';
    }
    const trimmed = String(rawValue).trim();
    if (trimmed === '' || trimmed === '/') {
        return '';
    }
    const withoutTrailingSlash = trimmed.replace(/\/+$/g, '');
    if (withoutTrailingSlash.startsWith('/')) {
        return withoutTrailingSlash;
    }
    return `/${withoutTrailingSlash}`;
}
export function buildHostedAppUrl(portalBaseUrl, basePath) {
    const portalUrl = new URL(portalBaseUrl);
    const normalizedBasePath = normalizeBasePath(basePath);
    portalUrl.pathname = normalizedBasePath === '' ? '/' : normalizedBasePath;
    portalUrl.search = '';
    portalUrl.hash = '';
    if (portalUrl.pathname === '/') {
        return portalUrl.origin;
    }
    return `${portalUrl.origin}${portalUrl.pathname}`;
}
