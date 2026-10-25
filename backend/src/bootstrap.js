// Imported first by server.js, before anything touches the libuv thread pool.
// Password hashing (scrypt) and file I/O run on this pool; the default of 4
// threads becomes a queue when hundreds of students log in at once.
process.env.UV_THREADPOOL_SIZE ||= String(Math.max(8, Number(process.env.THREADPOOL_SIZE || 16)));
