export function selectedMenuKey(path) {
    const first = path.split('/').filter(Boolean)[0] || '';
    return first || 'home';
}

export function menuPath(items, key) {
    return items.find((entry) => entry.key === key)?.path || '/';
}
