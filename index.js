const { token, teamupdatesChannelId } = require("./config.json");
const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");

const {
    dienstgrade,
    basis_nebenrollen,
    agent_nebenrollen,
    entlassung_rollen_add,
    einstellung_rollen_remove,
    abteilungen
} = require("./rollen.json");

const dienstnummern = require("./dienstnummern.json"); // map wurde in dienstnummern.json gespeichert
const mapPath = "./dienstnummern.json";

const FIB_LOGO =
    "https://cdn.discordapp.com/attachments/1364316792226316341/1511095061281247237/fib_logo.png";

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers
    ]
});

const fs = require("fs");

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

        // Hat schon FIB?
        const existing = getMemberFIB(member.id);
        if (existing) {
            // Nickname ggf. aktualisieren
            setNickname(member, existing);
            return;
        }

        // hat Dienstgrad?
        const role = member.roles.cache.find(r =>
            dienstgrade.includes(r.id)
        );
        if (!role) return;

        // freie Nummer suchen
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

    // bestehender Server-Name (IC Name)
    const baseName = member.nickname || member.user.username;

    // falls schon FIB drin ist → entfernen
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
            { name: "📅 Datum", value: formatDate(), inline: true },
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
 * READY
 * =========================
 */
client.once("ready", async () => {
    console.log(`Bot online als ${client.user.tag}`);

    const guild = client.guilds.cache.first();
    if (!guild) return;

    await syncExistingMembers(guild);

    console.log("✅ FIB Sync abgeschlossen");
    client.user.setPresence({
		activities: [{
		name: 'Schaut dem FIB bei der Arbeit zu',
		type: 3,
	 }],
	status: 'online',
  });
});

/**
 * =========================
 * INTERACTIONS
 * =========================
 */
client.on("interactionCreate", async (interaction) => {
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

        const oldRole = member.roles.cache.find(r =>
            dienstgrade.includes(r.id)
        );
        if (!oldRole) return interaction.reply({ content: "❌ Kein Dienstgrad", ephemeral: true });

        await member.roles.remove(oldRole);
        await member.roles.add(newRole);

        const oldFib = getMemberFIB(member.id);
        releaseFIB(member.id);

        const fib = assignFIB(member, newRole.id) || oldFib; // Nummer neu oder alte behalten
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

        const oldRole = member.roles.cache.find(r =>
            dienstgrade.includes(r.id)
        );
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
});

client.login(token);