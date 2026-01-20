declare module 'qrcode' {
  export function toDataURL(text: string, opts?: any): Promise<string>;
  const _default: { toDataURL: (text: string, opts?: any) => Promise<string> };
  export default _default;
}
