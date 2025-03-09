const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const ytdl = require("@distube/ytdl-core");
const fs = require("fs");
const path = require('path');
const agent = ytdl.createAgent(JSON.parse(fs.readFileSync("cookies.json")));

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    
    const sock = makeWASocket({
        printQRInTerminal: true,
        auth: state
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Koneksi terputus:', lastDisconnect?.error, 'Mencoba reconnect:', shouldReconnect);
            if (shouldReconnect) {
                startBot();
            }
        } else if (connection === 'open') {
            console.log('Bot WhatsApp telah terhubung!');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const messageText = msg.message.conversation || msg.message.extendedTextMessage?.text || '';

        // Cek apakah pesan adalah URL YouTube yang valid
        if (ytdl.validateURL(messageText)) {
            const url = messageText;

            try {
                await sock.sendMessage(from, { text: 'Sedang mendownload video... Mohon tunggu.' });

                const info = await ytdl.getInfo(url, { agent });
                const title = info.videoDetails.title;
                const fileName = `${title}.mp4`;
                const filePath = path.join(__dirname, 'downloads', fileName);

                if (!fs.existsSync('downloads')) {
                    fs.mkdirSync('downloads');
                }

                const video = ytdl(url, { 
                    quality: 'highestvideo',
                    filter: 'audioandvideo',
                    agent: agent
                });

                video.pipe(fs.createWriteStream(filePath));

                video.on('end', async () => {
                    await sock.sendMessage(from, { 
                        video: { url: filePath },
                        caption: `Judul: ${title}\nSelesai didownload!`
                    });

                    setTimeout(() => {
                        fs.unlink(filePath, (err) => {
                            if (err) console.error('Gagal menghapus file:', err);
                        });
                    }, 60000);
                });

                video.on('error', async (error) => {
                    await sock.sendMessage(from, { 
                        text: `Terjadi kesalahan saat mendownload: ${error.message}` 
                    });
                });

            } catch (error) {
                await sock.sendMessage(from, { 
                    text: `Error: ${error.message}` 
                });
            }
        }
    });
}

startBot().catch(console.error);
