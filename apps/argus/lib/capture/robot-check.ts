export function isRobotCheckPage(input: { url: string; title: string; html: string }): boolean {
  const url = input.url.toLowerCase();
  const title = input.title.toLowerCase();
  const html = input.html.toLowerCase();

  if (url.includes('validatecaptcha')) return true;
  if (title.includes('robot check')) return true;
  if (html.includes('enter the characters you see below')) return true;
  if (html.includes('sorry, we just need to make sure you\'re not a robot')) return true;
  if (html.includes('captcha')) return true;

  return false;
}

