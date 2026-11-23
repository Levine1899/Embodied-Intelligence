// 生成包含标题与段落的 Word 文档，无需上传稿件。
(function () {
  const encoder = new TextEncoder();
  const xml = value => value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    for (let i = 0; i < 8; i++) n = (n & 1) ? (0xedb88320 ^ (n >>> 1)) : (n >>> 1);
    return n >>> 0;
  });
  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }
  function zip(files) {
    const parts = [], directory = [];
    let offset = 0;
    const header = (size, fields) => {
      const bytes = new Uint8Array(size), view = new DataView(bytes.buffer);
      for (const [at, value, width] of fields) width === 2 ? view.setUint16(at, value, true) : view.setUint32(at, value, true);
      return bytes;
    };
    for (const [name, content] of files) {
      const filename = encoder.encode(name), data = encoder.encode(content), crc = crc32(data);
      const local = header(30, [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x800, 2], [14, crc, 4], [18, data.length, 4], [22, data.length, 4], [26, filename.length, 2]]);
      const central = header(46, [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x800, 2], [16, crc, 4], [20, data.length, 4], [24, data.length, 4], [28, filename.length, 2], [42, offset, 4]]);
      parts.push(local, filename, data); directory.push(central, filename);
      offset += local.length + filename.length + data.length;
    }
    const directorySize = directory.reduce((n, part) => n + part.length, 0);
    const end = header(22, [[0, 0x06054b50, 4], [8, files.length, 2], [10, files.length, 2], [12, directorySize, 4], [16, offset, 4]]);
    return new Blob([...parts, ...directory, end], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  }
  window.makeManuscriptDocx = function (text, hasTitle) {
    const lines = text.replace(/\r\n?/g, '\n').split('\n');
    const paragraphs = lines.map((line, i) => '<w:p>' + (hasTitle && i === 0 ? '<w:pPr><w:pStyle w:val="Title"/></w:pPr>' : '') + '<w:r><w:t xml:space="preserve">' + xml(line) + '</w:t></w:r></w:p>').join('');
    const declaration = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
    return zip([
      ['[Content_Types].xml', declaration + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>'],
      ['_rels/.rels', declaration + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'],
      ['word/_rels/document.xml.rels', declaration + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
      ['word/styles.xml', declaration + '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:pPr><w:spacing w:after="240"/></w:pPr><w:rPr><w:b/><w:sz w:val="36"/><w:szCs w:val="36"/></w:rPr></w:style></w:styles>'],
      ['word/document.xml', declaration + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + paragraphs + '<w:sectPr/></w:body></w:document>']
    ]);
  };
})();
