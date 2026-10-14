import { attachmentDisposition } from './content-disposition.js';

describe('attachmentDisposition', () => {
  it('ASCII-имя отдаётся как есть', () => {
    expect(attachmentDisposition('report.pdf')).toBe(
      `attachment; filename="report.pdf"; filename*=UTF-8''report.pdf`,
    );
  });

  it('кириллица кодируется в filename*, в filename — запасной вариант', () => {
    const header = attachmentDisposition('Запись встречи.mp4');
    expect(header).toContain('filename="______ _______.mp4"');
    expect(header).toContain(
      `filename*=UTF-8''${encodeURIComponent('Запись встречи.mp4')}`,
    );
  });

  it('кавычки и спецсимволы не ломают заголовок', () => {
    const header = attachmentDisposition(`a"b'c(1)*.txt`);
    expect(header).toContain('filename="a_b\'c(1)*.txt"');
    expect(header).toContain(`filename*=UTF-8''a%22b%27c%281%29%2A.txt`);
  });
});
