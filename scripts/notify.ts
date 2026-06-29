const barkUrl = process.env.BARK_URL;

if (!barkUrl) {
  console.log('Bark 未配置，已跳过通知');
  process.exit(0);
}

const title = encodeURIComponent('TranslateProject002');
const body = encodeURIComponent('MVP 已完成');
const separator = barkUrl.endsWith('/') ? '' : '/';
const url = `${barkUrl}${separator}${title}/${body}`;

try {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Bark 通知失败: ${response.status}`);
  }
  console.log('Bark 通知已发送');
} catch (error) {
  console.warn(error instanceof Error ? error.message : 'Bark 通知失败');
}

export {};
