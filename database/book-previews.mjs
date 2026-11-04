import {primaryBooks} from './primary-books.mjs';
// Public reading samples, one PDF per physical book. Keep the original filenames.
const samples = [];
for (const grade of [6,7,8,9]) for (const volume of [1,2]) {
  samples.push({id:'toan-'+grade+'-tap-'+volume,file:'PHAN DANG TOAN '+grade+'-TAP'+volume+'-BAN-DOC-THU.pdf'});
}
samples.push({id:'70-de-vao-6',file:'70 DE BUT TOC THI VAO LOP 6 CLC-BAN-DOC-THU.pdf'});
for(const book of primaryBooks)samples.push({id:book.id,file:book.sampleFile});
export const bookPreviews = samples.map(sample => ({...sample,url:'/assets/books%20preview/'+encodeURIComponent(sample.file)}));
