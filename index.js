// index.js
const { token, teamupdatesChannelId } = require("./config.json");
const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");

const {
    dienstgrade,
    basis_nebenrollen,
    agent_nebenrollen,
    entlassung_rollen_add,
    einstellung_rollen_remove,
    suspendierung,
    abteilungen
} = require("./rollen.json");

const dienstnummern = require("./dienstnummern.json"); // map in dienstnummern.json
const mapPath = "./dienstnummern.json";

const FIB_LOGO = "https://cdn.discordapp.com/attachments/1364316792226316341/1511095061281247237/fib_logo.png";

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

const fs = require("fs");
const path = require("path");
const suspensionFile = path.join(__dirname, "data", "suspendierungen.json");

/**
 * =========================
 * SAVE MAP
 * =========================
 */
function saveMap() {
    fs.writeFileSync(mapPath, JSON.stringify(dienstnummern, null, 2));
}

/**
 * =========================
 * AUTO SYNC ON START
 * =========================
 */
async function syncExistingMembers(guild) {
    await guild.members.fetch();

    guild.members.cache.forEach(member => {
        if (member.user.bot) return;

        const existing = getMemberFIB(member.id);
        if (existing) {
            setNickname(member, existing);
            return;
        }

        const role = member.roles.cache.find(r => dienstgrade.includes(r.id));
        if (!role) return;

        const fib = assignFIB(member, role.id);
        setNickname(member, fib);
    });

    saveMap();
}

/**
 * =========================
 * HELPERS (DN SYSTEM)
 * =========================
 */
function getFreeFIBNumber(roleId) {
    return Object.entries(dienstnummern.map).find(([fib, data]) =>
        data.roleId === roleId && data.member === null
    );
}

function assignFIB(member, roleId) {
    const free = getFreeFIBNumber(roleId);
    if (!free) return null;

    const [fibNumber] = free;
    dienstnummern.map[fibNumber].member = member.id;

    saveMap();
    return fibNumber;
}

function releaseFIB(memberId) {
    for (const key in dienstnummern.map) {
        if (dienstnummern.map[key].member === memberId) {
            dienstnummern.map[key].member = null;
        }
    }
    saveMap();
}

function getMemberFIB(memberId) {
    for (const key in dienstnummern.map) {
        if (dienstnummern.map[key].member === memberId) return key;
    }
    return null;
}

function setNickname(member, fib) {
    if (!fib) return;

    const baseName = member.nickname || member.user.username;
    const cleaned = baseName.replace(/^\[FIB-\d+\]\s*/, "");
    const newName = `[${fib}] ${cleaned}`;

    member.setNickname(newName).catch(() => {});
}

/**
 * =========================
 * EMBED SYSTEM
 * =========================
 */
function formatDate() {
    return new Date().toLocaleDateString("de-DE", {
        day: "2-digit",
        month: "long",
        year: "numeric"
    });
}

async function sendUpdate(member, data) {
    const embed = new EmbedBuilder()
        .setColor(data.color || 0x2b2d31)
        .setTitle(data.title)
        .setDescription(data.description)
        .setThumbnail(FIB_LOGO)
        .addFields(
            { name: "📄 Grund", value: data.reason || "Kein Grund angegeben" },
            { name: "📅 Datum", value: `<t:${Math.floor(Date.now()/1000)}:F>`, inline: true },
            { name: "👮 Ausgeführt von", value: data.executor, inline: true }
        )
        .setTimestamp();

    try { await member.send({ embeds: [embed] }); } catch {}
    try {
        const channel = await client.channels.fetch(teamupdatesChannelId);
        if (channel) await channel.send({ embeds: [embed] });
    } catch {}
}

/**
 * =========================
 * SUSPENDIERUNGEN
 * =========================
 */
function loadSuspensions() {
    if (!fs.existsSync(suspensionFile)) {
        fs.writeFileSync(suspensionFile, "{}");
    }
    return JSON.parse(fs.readFileSync(suspensionFile, "utf8"));
}

function saveSuspensions(data) {
    fs.writeFileSync(suspensionFile, JSON.stringify(data, null, 4));
}

function getSuspendableRoles() {
    const roles = new Set();

    dienstgrade.forEach(role => roles.add(role));
    basis_nebenrollen.forEach(role => roles.add(role));
    agent_nebenrollen.forEach(role => roles.add(role));

    Object.values(abteilungen).forEach(department => {
        Object.entries(department).forEach(([key, value]) => {
            if (key !== "name") roles.add(value);
        });
    });

    return [...roles];
}
setInterval(async () => {
    const suspensions = loadSuspensions();
    const now = Date.now();
    for (const [userId, data] of Object.entries(suspensions)) {
        if (data.expires && now >= data.expires) {
            const guild = client.guilds.cache.first();
            const member = await guild.members.fetch(userId).catch(()=>null);
            if (member) {
                // Rollen zurückgeben
                await member.roles.add(data.roles);
                await member.roles.remove(suspendierung);

                await sendUpdate(member, {
                    title: "▶️ Suspendierung automatisch aufgehoben",
                    description: `<@${member.id}> ist wieder aktiv (automatisch).`,
                    reason: "Ablauf der Suspendierung",
                    executor: client.user.tag,
                    color: 0x57f287
                });
            }
            delete suspensions[userId];
        }
    }
    saveSuspensions(suspensions);
}, 60_000); // jede Minute prüfen

/**
 * =========================
 * CLIENT READY
 * =========================
 */
client.once("ready", async () => {
    console.log(`Bot online als ${client.user.tag}`);

    const guild = client.guilds.cache.first();
    if (!guild) return;

    await syncExistingMembers(guild);
    console.log("✅ FIB Sync abgeschlossen");

    client.user.setPresence({
        activities: [{ name: 'Schaut dem FIB bei der Arbeit zu', type: 3 }],
        status: 'online',
    });
});

/**
 * =========================
 * INTERACTIONS
 * =========================
 */
client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;
    const member = interaction.options.getMember("mitarbeiter");
    const grund = interaction.options.getString("grund") || "Kein Grund";

    /**
     * =========================
     * EINSTELLEN
     * =========================
     */
    if (commandName === "einstellen") {
        const dienstgrad = interaction.options.getRole("dienstgrad");

        await member.roles.add(dienstgrad);
        await member.roles.add(basis_nebenrollen);
        await member.roles.remove(einstellung_rollen_remove);

        const fib = assignFIB(member, dienstgrad.id);
        setNickname(member, fib);

        await sendUpdate(member, {
            title: "👮‍♂️ Einstellung",
            description: `<@${member.id}> wurde eingestellt als **${dienstgrad.name}**.\nDienstnummer: **${fib || "Keine frei"}**`,
            reason: grund,
            executor: interaction.user.tag,
            color: 0x57f287
        });

        return interaction.reply({ content: "✅ eingestellt", ephemeral: true });
    }

    /**
     * =========================
     * ENTLASSEN
     * =========================
     */
    if (commandName === "entlassen") {
        releaseFIB(member.id);

        await member.roles.remove(dienstgrade);
        await member.roles.remove(basis_nebenrollen);
        await member.roles.remove(agent_nebenrollen);
        await member.roles.add(entlassung_rollen_add);

        await member.setNickname(member.user.username).catch(() => {});

        await sendUpdate(member, {
            title: "🔴 Entlassung",
            description: `<@${member.id}> wurde entlassen.`,
            reason: grund,
            executor: interaction.user.tag,
            color: 0xed4245
        });

        return interaction.reply({ content: "🔴 entlassen", ephemeral: true });
    }

    /**
     * =========================
     * BEFÖRDERN
     * =========================
     */
    if (commandName === "befoerdern") {
        const newRole = interaction.options.getRole("dienstgrad");

        const oldRole = member.roles.cache.find(r => dienstgrade.includes(r.id));
        if (!oldRole) return interaction.reply({ content: "❌ Kein Dienstgrad", ephemeral: true });

        await member.roles.remove(oldRole);
        await member.roles.add(newRole);

        const oldFib = getMemberFIB(member.id);
        releaseFIB(member.id);

        const fib = assignFIB(member, newRole.id) || oldFib;
        setNickname(member, fib);

        await sendUpdate(member, {
            title: "🚀 Beförderung",
            description: `<@${member.id}> wurde befördert zu **${newRole.name}**.\nDienstnummer: **${fib || "Keine"}**`,
            reason: grund,
            executor: interaction.user.tag,
            color: 0x5865f2
        });

        return interaction.reply({ content: "🚀 befördert", ephemeral: true });
    }

    /**
     * =========================
     * DEGRADIEREN
     * =========================
     */
    if (commandName === "degradieren") {
        const newRole = interaction.options.getRole("dienstgrad");

        const oldRole = member.roles.cache.find(r => dienstgrade.includes(r.id));
        if (!oldRole) return interaction.reply({ content: "❌ Kein Dienstgrad", ephemeral: true });

        await member.roles.remove(oldRole);
        await member.roles.add(newRole);

        releaseFIB(member.id);
        const fib = assignFIB(member, newRole.id);
        setNickname(member, fib);

        await sendUpdate(member, {
            title: "⬇️ Degradierung",
            description: `<@${member.id}> wurde degradiert zu **${newRole.name}**.\nDienstnummer: **${fib || "Keine"}**`,
            reason: grund,
            executor: interaction.user.tag,
            color: 0xfaa61a
        });

        return interaction.reply({ content: "⬇️ degradiert", ephemeral: true });
    }

    /**
     * =========================
     * SUSPENDIEREN
     * =========================
     */
    if (commandName === "suspendieren") {
        const member = interaction.options.getMember("mitarbeiter");
        const grund = interaction.options.getString("grund") || "Kein Grund angegeben";
        const duration = interaction.options.getString("dauer"); // optional

        const suspensions = loadSuspensions();

        if (suspensions[member.id]) {
            return interaction.reply({
                content: "❌ Dieser Mitarbeiter ist bereits suspendiert.",
                ephemeral: true
            });
        }

        /**
         * =========================
         * Dauer berechnen (optional)
         * =========================
         */
        let expires = null;
        if (duration) {
            const unit = duration.slice(-1);
            const amount = parseInt(duration.slice(0, -1));
            if (!isNaN(amount)) {
                const now = Date.now();
                if (unit === "d") expires = now + amount * 24 * 60 * 60 * 1000;
                else if (unit === "h") expires = now + amount * 60 * 60 * 1000;
                else if (unit === "m") expires = now + amount * 60 * 1000;
            }
        }

        /**
         * =========================
         * Rollen sammeln
         * =========================
         */
        const removableRoles = getSuspendableRoles();
        const rolesToRemove = member.roles.cache
            .filter(role => removableRoles.includes(role.id))
            .map(role => role.id);

        /**
         * =========================
         * Rollen entfernen + Suspend-Rolle geben
         * =========================
         */
        if (rolesToRemove.length > 0) {
            await member.roles.remove(rolesToRemove);
        }
        await member.roles.add(suspendierung);

        /**
         * =========================
         * Speichern
         * =========================
         */
        suspensions[member.id] = {
            roles: rolesToRemove,
            reason: grund,
            moderator: interaction.user.id,
            timestamp: Date.now(),
            expires: expires // kann null sein (bis Gespräch)
        };
        saveSuspensions(suspensions);

        /**
         * =========================
         * Embed für Team-Update senden
         * =========================
         */
        await sendUpdate(member, {
            title: "⏸️ Suspendierung",
            description: `<@${member.id}> wurde suspendiert.\n⏱ Ende: <t:${Math.floor(expires / 1000)}:F> (<t:${Math.floor(expires / 1000)}:R>)`,
            reason: grund,
            executor: interaction.user.tag,
            color: 0xffaa00
        });

        return interaction.reply({
            content:
                expires
                    ? `⏸️ Mitarbeiter suspendiert bis <t:${Math.floor(expires / 1000)}:F>`
                    : "⏸️ Mitarbeiter suspendiert (bis Gespräch)",
            ephemeral: true
        });
    }

    /**
     * =========================
     * SUSPENDIERUNG AUFHEBEN
     * =========================
     */
    if (commandName === "suspendierung_aufheben") {
        const member = interaction.options.getMember("mitarbeiter");
        const grund = interaction.options.getString("grund") || "Kein Grund angegeben";

        const suspensions = loadSuspensions();

        if (!suspensions[member.id]) {
            return interaction.reply({
                content: "❌ Dieser Mitarbeiter ist nicht suspendiert.",
                ephemeral: true
            });
        }

        // Rollen wiedergeben
        const savedRoles = suspensions[member.id].roles || [];
        if (savedRoles.length > 0) await member.roles.add(savedRoles);
        await member.roles.remove(suspendierung);

        delete suspensions[member.id];
        saveSuspensions(suspensions);

        await sendUpdate(member, {
            title: "▶️ Suspendierung aufgehoben",
            description: `<@${member.id}> ist wieder aktiv.`,
            reason: grund,
            executor: interaction.user.tag,
            color: 0x57f287
        });

        return interaction.reply({
            content: "▶️ Suspendierung aufgehoben",
            ephemeral: true
        });
    }
});

client.login(token);