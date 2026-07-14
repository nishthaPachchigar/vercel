const MAX_LEN = 5;

export function generate() {
    let ans = "";
    const subset = "123456789qwertyuiopasdfghjklzxcvbnm";
    for (let i = 0; i < MAX_LEN; i++) {
        const idx = Math.floor(Math.random() * subset.length);
        ans += subset.charAt(idx);
    }
    return ans;
}