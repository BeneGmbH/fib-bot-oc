// index.js
require("dotenv").config();
const {
    teamupdatesChannelId,
    personalChannelId,
    besprechungInternChannelId,
    besprechungChannelId,
    abmeldungChannelId
} = require("./config.json");
const {
    Client, GatewayIntentBits, EmbedBuilder, Partials,
    ActionRowBuilder, ButtonBuilder, ButtonStyle,
    ModalBuilder, TextInputBuilder, TextInputStyle
} = require("discord.js");

const {
    dienstgrade,
    basis_nebenrollen,
    agent_nebenrollen,
    entlassung_rollen_add,
    einstellung_rollen_remove,
    suspendierung,
    abteilungen,
    verwarnungen
} = require("./rollen.json");

const permissions = require("./permissions.json");
const dienstnummern = require("./dienstnummern.json");
const mapPath = "./dienstnummern.json";

const FIB_LOGO = "https://cdn.discordapp.com/attachments/1364316792226316341/1511095061281247237/fib_logo.png";

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions
    ],
    partials: [
        Partials.Channel,
        Partials.GuildMember,
        Partials.Message,
        Partials.Reaction,
        Partials.User
    ]
});

const fs = require("fs");
const path = require("path");
const suspensionFile = path.join(__dirname, "data", "suspendierungen.json");
const sanctionFile = path.join(__dirname, "data", "sanktionen.json");

const besprechungenFile = path.join(__dirname, "data", "besprechungen.json");
const abmeldungenFile = path.join(__dirname, "data", "abmeldungen.json");

const EMOJI_ANWESEND = "✅";
const EMOJI_NICHT_ANWESEND = "❌";

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
    try {
        await guild.members.fetch();
    } catch (err) {
        console.error("❌ Fehler beim Fetchen der Mitglieder:", err);
        return;
    }

    const promises = [];

    guild.members.cache.forEach(member => {
        if (member.user.bot) return;

        const existing = getMemberFIB(member.id);
        if (existing) {
            promises.push(setNickname(member, existing));
            return;
        }

        const role = member.roles.cache.find(r => dienstgrade.includes(r.id));
        if (!role) return;

        const fib = assignFIB(member, role.id);
        if (fib) promises.push(setNickname(member, fib));
    });

    // Alle Nickname-Änderungen abwarten (Rate-Limit-sicher sequentiell)
    for (const p of promises) {
        await p.catch(() => {});
    }

    saveMap();
}

/**
 * =========================
 * HELPERS (DN SYSTEM)
 * =========================
 */
function getFreeFIBNumber(roleId) {
    return Object.entries(dienstnummern.map).find(([, data]) =>
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

async function setNickname(member, fib) {
    if (!fib) return;

    const baseName = member.nickname || member.user.username;
    const cleaned = baseName.replace(/^\[FIB-\d+\]\s*/, "");
    const newName = `[${fib}] ${cleaned}`;

    await member.setNickname(newName).catch(() => {});
}

/**
 * =========================
 * COMMAND PERMISSIONS
 * =========================
 */
function hasCommandPermission(member, commandName) {
    // Full Access Rollen dürfen alles
    if (member.roles.cache.some(role => permissions.full_access.includes(role.id))) {
        return true;
    }

    const allowedRoles = permissions[commandName];

    // Command nicht in permissions definiert → nur full_access darf (sicherer Default)
    if (!allowedRoles) return false;

    return member.roles.cache.some(role => allowedRoles.includes(role.id));
}

/**
 * =========================
 * EMBED SYSTEM
 * =========================
 */
async function sendUpdate(member, data) {
    const embed = new EmbedBuilder()
        .setColor(data.color || 0x2b2d31)
        .setTitle(data.title)
        .setDescription(data.description)
        .setThumbnail(FIB_LOGO)
        .addFields(
            { name: "📄 Grund", value: data.reason || "Kein Grund angegeben" },
            { name: "📅 Datum", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
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
        fs.mkdirSync(path.dirname(suspensionFile), { recursive: true });
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
            // Nur echte Rollen-IDs (Strings) hinzufügen, keine verschachtelten Objekte
            if (key !== "name" && typeof value === "string") {
                roles.add(value);
            }
        });
    });

    return [...roles];
}

// Automatisches Aufheben abgelaufener Suspendierungen (jede Minute)
setInterval(async () => {
    const suspensions = loadSuspensions();
    const now = Date.now();

    for (const [userId, data] of Object.entries(suspensions)) {
        if (!data.expires || now < data.expires) continue;

        try {
            const guild = client.guilds.cache.first();
            if (!guild) continue;

            const member = await guild.members.fetch(userId).catch(() => null);
            if (member) {
                await member.roles.remove(suspendierung).catch(() => {});
                if (data.roles?.length > 0) {
                    await member.roles.add(data.roles).catch(() => {});
                }

                await sendUpdate(member, {
                    title: "▶️ Suspendierung automatisch aufgehoben",
                    description: `<@${member.id}> ist wieder aktiv (automatisch).`,
                    reason: "Ablauf der Suspendierung",
                    executor: client.user.tag,
                    color: 0x57f287
                });
            }
        } catch (err) {
            console.error(`Fehler beim automatischen Aufheben für ${userId}:`, err);
        }

        delete suspensions[userId];
    }

    saveSuspensions(suspensions);
}, 60_000);

/**
 * =========================
 * SANKTIONEN
 * =========================
 */
function loadSanctions() {
    if (!fs.existsSync(sanctionFile)) {
        fs.mkdirSync(path.dirname(sanctionFile), { recursive: true });
        fs.writeFileSync(sanctionFile, "{}");
    }
    return JSON.parse(fs.readFileSync(sanctionFile, "utf8"));
}

function saveSanctions(data) {
    fs.writeFileSync(sanctionFile, JSON.stringify(data, null, 4));
}

/**
 * =========================
 * BESPRECHUNGEN
 * =========================
 */
function loadBesprechungen() {
    if (!fs.existsSync(besprechungenFile)) {
        fs.mkdirSync(path.dirname(besprechungenFile), { recursive: true });
        fs.writeFileSync(besprechungenFile, "{}");
    }   
    return JSON.parse(fs.readFileSync(besprechungenFile, "utf8"));
}

function saveBesprechungen(data) {
    fs.writeFileSync(besprechungenFile, JSON.stringify(data, null, 4));
}

function parseDatumUhrzeit(datum, uhrzeit) {
    const datumMatch = datum.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    const zeitMatch = uhrzeit.match(/^(\d{2}):(\d{2})$/);
    if (!datumMatch || !zeitMatch) return null;

    const [, tt, mo, jjjj] = datumMatch;
    const [, hh, min] = zeitMatch;

    const date = new Date(
        parseInt(jjjj), parseInt(mo) - 1, parseInt(tt),
        parseInt(hh), parseInt(min), 0
    );

    if (isNaN(date.getTime())) return null;
    return date.getTime();
}

/**
 * =========================
 * ABMELDUNGEN
 * =========================
 */
function loadAbmeldungen() {
    if (!fs.existsSync(abmeldungenFile)) {
        fs.mkdirSync(path.dirname(abmeldungenFile), { recursive: true });
        fs.writeFileSync(abmeldungenFile, "{}");
    }
    return JSON.parse(fs.readFileSync(abmeldungenFile, "utf8"));
}

function saveAbmeldungen(data) {
    fs.writeFileSync(abmeldungenFile, JSON.stringify(data, null, 4));
}

function parseDauer(dauer) {
    if (!dauer) return null;
    const match = dauer.match(/^(\d+)([dhm])$/);
    if (!match) return null;

    const amount = parseInt(match[1]);
    const unit = match[2].toLowerCase();

    if (unit === "d") return amount * 24 * 60 * 60 * 1000;
    if (unit === "h") return amount * 60 * 60 * 1000;
    if (unit === "m") return amount * 60 * 1000;
    return null;
}

function isCurrentlyAbgemeldet(abmeldungen, userId) {
    const now = Date.now();
    const eintraege = abmeldungen[userId] || [];
    return eintraege.some(e => now >= e.start && now <= e.ende);
}

function getAktiveAbmeldung(abmeldungen, userId) {
    const now = Date.now();
    const eintraege = abmeldungen[userId] || [];
    return eintraege.find(e => now >= e.start && now <= e.ende) || null;
}

function formatDauer(ms) {
    const minuten = Math.floor(ms / 60000);
    const tage = Math.floor(minuten / 1440);
    const stunden = Math.floor((minuten % 1440) / 60);
    const rest = minuten % 60;

    const teile = [];
    if (tage > 0) teile.push(`${tage} Tag(e)`);
    if (stunden > 0) teile.push(`${stunden} Stunde(n)`);
    if (rest > 0 || teile.length === 0) teile.push(`${rest} Minute(n)`);

    return teile.join(" ");
}

async function sendAbmeldungUpdate(user, eintrag) {
    const embed = new EmbedBuilder()
        .setColor(0xffaa00)
        .setTitle("📩 Neue Abmeldung")
        .setThumbnail(FIB_LOGO)
        .setDescription(`<@${user.id}> hat sich abgemeldet.`)
        .addFields(
            { name: "⏱ Bis", value: `<t:${Math.floor(eintrag.ende / 1000)}:F> (<t:${Math.floor(eintrag.ende / 1000)}:R>)`, inline: true },
            { name: "📄 Grund", value: eintrag.grund, inline: true }
        )
        .setTimestamp();

    try {
        const channel = await client.channels.fetch(abmeldungChannelId);
        if (channel) await channel.send({ embeds: [embed] });
    } catch (err) {
        console.error("Fehler beim Senden der Abmeldungs-Benachrichtigung:", err);
    }
}

// Automatische Auswertung fälliger Besprechungen (jede Minute)
setInterval(async () => {
    const besprechungen = loadBesprechungen();
    const now = Date.now();
    let changed = false;

    for (const [messageId, eintrag] of Object.entries(besprechungen)) {
        if (eintrag.ausgewertet || now < eintrag.zeitpunkt) continue;

        try {
            const channel = await client.channels.fetch(eintrag.channelId).catch(() => null);
            const message = channel ? await channel.messages.fetch(messageId).catch(() => null) : null;

            if (!message) {
                eintrag.ausgewertet = true;
                changed = true;
                continue;
            }

            const anwesendReaction = message.reactions.cache.get(EMOJI_ANWESEND);
            const nichtAnwesendReaction = message.reactions.cache.get(EMOJI_NICHT_ANWESEND);

            const anwesendUsers = anwesendReaction
                ? (await anwesendReaction.users.fetch()).filter(u => !u.bot)
                : new Map();
            const nichtAnwesendUsers = nichtAnwesendReaction
                ? (await nichtAnwesendReaction.users.fetch()).filter(u => !u.bot)
                : new Map();

            const abmeldungen = loadAbmeldungen();

            const anwesendListe = [];
            const nichtAnwesendListe = [];
            const autoNichtAnwesendListe = [];

            for (const [userId] of anwesendUsers) {
                if (isCurrentlyAbgemeldet(abmeldungen, userId)) {
                    autoNichtAnwesendListe.push(userId);
                } else {
                    anwesendListe.push(userId);
                }
            }

            for (const [userId] of nichtAnwesendUsers) {
                if (anwesendUsers.has(userId)) continue; // sollte durch Exklusivität nicht vorkommen
                if (isCurrentlyAbgemeldet(abmeldungen, userId)) {
                    if (!autoNichtAnwesendListe.includes(userId)) autoNichtAnwesendListe.push(userId);
                } else {
                    nichtAnwesendListe.push(userId);
                }
            }

            const format = list => list.length > 0 ? list.map(id => `<@${id}>`).join("\n") : "Keine";

            const auswertungsEmbed = new EmbedBuilder()
                .setColor(0x2b2d31)
                .setTitle(`📋 Auswertung: ${eintrag.titel}`)
                .setThumbnail(FIB_LOGO)
                .addFields(
                    { name: `${EMOJI_ANWESEND} Anwesend (${anwesendListe.length})`, value: format(anwesendListe), inline: true },
                    { name: `${EMOJI_NICHT_ANWESEND} Nicht Anwesend (${nichtAnwesendListe.length})`, value: format(nichtAnwesendListe), inline: true },
                    { name: `⏸️ Automatisch abgemeldet (${autoNichtAnwesendListe.length})`, value: format(autoNichtAnwesendListe), inline: true }
                )
                .setFooter({ text: `Zeitpunkt der Besprechung: ${new Date(eintrag.zeitpunkt).toLocaleString("de-DE")}` })
                .setTimestamp();

            const internChannel = await client.channels.fetch(besprechungInternChannelId).catch(() => null);
            if (internChannel) await internChannel.send({ embeds: [auswertungsEmbed] });

            eintrag.ausgewertet = true;
            changed = true;
        } catch (err) {
            console.error(`Fehler bei Auswertung der Besprechung ${messageId}:`, err);
        }
    }

    if (changed) saveBesprechungen(besprechungen);
}, 60_000);

/**
 * =========================
 * ABMELDUNG - BUTTON & MODAL
 * =========================
 */
client.on("interactionCreate", async interaction => {
    // Button gedrückt -> Modal öffnen
    if (interaction.isButton() && interaction.customId === "abmeldung_button") {
        const abmeldungen = loadAbmeldungen();
        const bereitsAktiv = getAktiveAbmeldung(abmeldungen, interaction.user.id);

        if (bereitsAktiv) {
            return interaction.reply({
                content: `❌ Du bist bereits abgemeldet bis <t:${Math.floor(bereitsAktiv.ende / 1000)}:F>.`,
                ephemeral: true
            });
        }

        const modal = new ModalBuilder()
            .setCustomId("abmeldung_modal")
            .setTitle("Abmelden");

        const dauerInput = new TextInputBuilder()
            .setCustomId("abmeldung_dauer")
            .setLabel("Dauer (z. B. 3d, 12h, 30m)")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const grundInput = new TextInputBuilder()
            .setCustomId("abmeldung_grund")
            .setLabel("Grund")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(dauerInput),
            new ActionRowBuilder().addComponents(grundInput)
        );

        return interaction.showModal(modal);
    }

    // Modal abgeschickt -> Abmeldung eintragen (gleiche Logik wie /abmelden)
    if (interaction.isModalSubmit() && interaction.customId === "abmeldung_modal") {
        const dauer = interaction.fields.getTextInputValue("abmeldung_dauer");
        const abmeldeGrund = interaction.fields.getTextInputValue("abmeldung_grund");

        const ms = parseDauer(dauer);
        if (!ms) {
            return interaction.reply({
                content: "❌ Ungültiges Dauer-Format. Nutze z. B. `3d`, `12h` oder `30m`.",
                ephemeral: true
            });
        }

        const abmeldungen = loadAbmeldungen();
        const userId = interaction.user.id;
        if (!abmeldungen[userId]) abmeldungen[userId] = [];

        const now = Date.now();
        const bereitsAktiv = getAktiveAbmeldung(abmeldungen, userId);
        if (bereitsAktiv) {
            return interaction.reply({
                content: `❌ Du bist bereits abgemeldet bis <t:${Math.floor(bereitsAktiv.ende / 1000)}:F>.`,
                ephemeral: true
            });
        }

        const ende = now + ms;
        const neuerEintrag = { start: now, ende, grund: abmeldeGrund };
        abmeldungen[userId].push(neuerEintrag);
        saveAbmeldungen(abmeldungen);

        await sendAbmeldungUpdate(interaction.user, neuerEintrag);

        return interaction.reply({
            content: `✅ Du bist abgemeldet bis <t:${Math.floor(ende / 1000)}:F> (<t:${Math.floor(ende / 1000)}:R>).\n📄 Grund: ${abmeldeGrund}`,
            ephemeral: true
        });
    }
});

/**
 * =========================
 * CLIENT READY
 * =========================
 */
client.once("clientReady", async () => {
    console.log(`Bot online als ${client.user.tag}`);

    const guild = client.guilds.cache.first();
    if (!guild) {
        console.error("❌ Kein Guild gefunden.");
        return;
    }

    await syncExistingMembers(guild);
    console.log("✅ FIB Sync abgeschlossen. Willkommen zurück Bene!");

    client.user.setPresence({
        activities: [{ name: "Schaut dem FIB bei der Arbeit zu", type: 3 }],
        status: "online"
    });
});

/**
 * =========================
 * JOIN
 * =========================
 */
client.on('guildMemberAdd', async (member) => {
    const role = member.guild.roles.cache.get('1456757334218117161');

    if (role) {
        await member.roles.add(role);
    }
});

/**
 * =========================
 * BESPRECHUNG - REACTION EXKLUSIVITÄT
 * =========================
 */
client.on("messageReactionAdd", async (reaction, user) => {
    if (user.bot) return;

    try {
        if (reaction.partial) await reaction.fetch();
        if (reaction.message.partial) await reaction.message.fetch();
    } catch {
        return;
    }

    const emoji = reaction.emoji.name;
    if (![EMOJI_ANWESEND, EMOJI_NICHT_ANWESEND].includes(emoji)) return;

    const besprechungen = loadBesprechungen();
    const eintrag = besprechungen[reaction.message.id];
    if (!eintrag || eintrag.ausgewertet) return;

    const oppositeEmoji = emoji === EMOJI_ANWESEND ? EMOJI_NICHT_ANWESEND : EMOJI_ANWESEND;
    const oppositeReaction = reaction.message.reactions.cache.get(oppositeEmoji);

    if (oppositeReaction) {
        try { await oppositeReaction.users.remove(user.id); } catch {}
    }
});

/**
 * =========================
 * INTERACTIONS
 * =========================
 */
client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    const OPEN_COMMANDS = ["abmelden"]; // für alle nutzbar, kein Rollencheck

    if (!OPEN_COMMANDS.includes(commandName) && !hasCommandPermission(interaction.member, commandName)) {
        return interaction.reply({
            content: "❌ Du hast keine Berechtigung für diesen Command.",
            ephemeral: true
        });
    }

// Gemeinsame Optionen (nur für Commands, die "mitarbeiter" nutzen)
    const MEMBER_COMMANDS = [
        "einstellen", "entlassen", "befoerdern", "degradieren",
        "suspendieren", "suspendierung_aufheben",
        "sanktionieren", "sanktionen", "sanktion_loeschen",
        "abteilung_zuweisen", "abteilung_entfernen"
    ];

    let member = null;
    let grund = "Kein Grund angegeben";

    if (MEMBER_COMMANDS.includes(commandName)) {
        member = interaction.options.getMember("mitarbeiter");
        grund = interaction.options.getString("grund") || "Kein Grund angegeben";

        if (!member) {
            return interaction.reply({
                content: "❌ Mitarbeiter nicht gefunden.",
                ephemeral: true
            });
        }
    }

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
        await setNickname(member, fib);

        await sendUpdate(member, {
            title: "👮‍♂️ Einstellung",
            description: `<@${member.id}> wurde eingestellt als **${dienstgrad.name}**.\nDienstnummer: **${fib || "Keine frei"}**`,
            reason: grund,
            executor: interaction.user.tag,
            color: 0x57f287
        });

        return interaction.reply({ content: "✅ Eingestellt.", ephemeral: true });
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

        return interaction.reply({ content: "🔴 Entlassen.", ephemeral: true });
    }

    /**
     * =========================
     * BEFÖRDERN
     * =========================
     */
    if (commandName === "befoerdern") {
        const newRole = interaction.options.getRole("dienstgrad");

        const oldRole = member.roles.cache.find(r => dienstgrade.includes(r.id));
        if (!oldRole) {
            return interaction.reply({ content: "❌ Kein Dienstgrad gefunden.", ephemeral: true });
        }

        // Alte Rolle & FIB freigeben
        const oldFib = getMemberFIB(member.id);
        await member.roles.remove(oldRole);
        releaseFIB(member.id);

        // Neue Rolle & FIB zuweisen
        await member.roles.add(newRole);
        const newFib = assignFIB(member, newRole.id);

        // Nur neue FIB nutzen; wenn keine frei, alte behalten (aber nicht neu vergeben)
        await setNickname(member, newFib || oldFib);

        await sendUpdate(member, {
            title: "🚀 Beförderung",
            description: `<@${member.id}> wurde befördert zu **${newRole.name}**.\nDienstnummer: **${newFib || oldFib || "Keine"}**`,
            reason: grund,
            executor: interaction.user.tag,
            color: 0x5865f2
        });

        return interaction.reply({ content: "🚀 Befördert.", ephemeral: true });
    }

    /**
     * =========================
     * DEGRADIEREN
     * =========================
     */
    if (commandName === "degradieren") {
        const newRole = interaction.options.getRole("dienstgrad");

        const oldRole = member.roles.cache.find(r => dienstgrade.includes(r.id));
        if (!oldRole) {
            return interaction.reply({ content: "❌ Kein Dienstgrad gefunden.", ephemeral: true });
        }

        await member.roles.remove(oldRole);
        releaseFIB(member.id);

        await member.roles.add(newRole);
        const fib = assignFIB(member, newRole.id);
        await setNickname(member, fib);

        await sendUpdate(member, {
            title: "⬇️ Degradierung",
            description: `<@${member.id}> wurde degradiert zu **${newRole.name}**.\nDienstnummer: **${fib || "Keine"}**`,
            reason: grund,
            executor: interaction.user.tag,
            color: 0xfaa61a
        });

        return interaction.reply({ content: "⬇️ Degradiert.", ephemeral: true });
    }

    /**
     * =========================
     * SUSPENDIEREN
     * =========================
     */
    if (commandName === "suspendieren") {
        const duration = interaction.options.getString("dauer");
        const ansprechpartner = interaction.options.getUser("ansprechpartner");

        const suspensions = loadSuspensions();

        if (suspensions[member.id]) {
            return interaction.reply({
                content: "❌ Dieser Mitarbeiter ist bereits suspendiert.",
                ephemeral: true
            });
        }

        // Dauer berechnen (optional)
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

        // Rollen sammeln & entfernen
        const removableRoles = getSuspendableRoles();
        const rolesToRemove = member.roles.cache
            .filter(role => removableRoles.includes(role.id))
            .map(role => role.id);

        if (rolesToRemove.length > 0) {
            await member.roles.remove(rolesToRemove);
        }
        await member.roles.add(suspendierung);

        suspensions[member.id] = {
            roles: rolesToRemove,
            reason: grund,
            moderator: interaction.user.id,
            timestamp: Date.now(),
            expires
        };
        saveSuspensions(suspensions);

        const ansprechpartnerMention = ansprechpartner ? `<@${ansprechpartner.id}>` : interaction.user.tag;

        await sendUpdate(member, {
            title: "⏸️ Suspendierung",
            description:
                (expires
                    ? `<@${member.id}> wurde suspendiert.\n⏱ Ende: <t:${Math.floor(expires / 1000)}:F> (<t:${Math.floor(expires / 1000)}:R>)`
                    : `<@${member.id}> wurde suspendiert.\n⏱ Ende: Bis Gespräch`) +
                `\n\n🚫 **Ein Dienstantritt während der Suspendierung hat eine sofortige Entlassung zur Folge.**` +
                `\n📩 Bitte melde dich bei: ${ansprechpartnerMention}`,
            reason: grund,
            executor: interaction.user.tag,
            color: 0xffaa00
        });

        return interaction.reply({
            content: expires
                ? `⏸️ Mitarbeiter suspendiert bis <t:${Math.floor(expires / 1000)}:F>`
                : "⏸️ Mitarbeiter suspendiert (bis Gespräch).",
            ephemeral: true
        });
    }

    /**
     * =========================
     * SUSPENDIERUNG AUFHEBEN
     * =========================
     */
    if (commandName === "suspendierung_aufheben") {
        const suspensions = loadSuspensions();

        if (!suspensions[member.id]) {
            return interaction.reply({
                content: "❌ Dieser Mitarbeiter ist nicht suspendiert.",
                ephemeral: true
            });
        }

        const savedRoles = suspensions[member.id].roles || [];

        try {
            await member.roles.remove(suspendierung);

            if (savedRoles.length > 0) {
                await member.roles.add(savedRoles);
            }

            delete suspensions[member.id];
            saveSuspensions(suspensions);

            await sendUpdate(member, {
                title: "▶️ Suspendierung aufgehoben",
                description: `<@${member.id}> ist wieder zum Dienst freigegeben.`,
                reason: grund,
                executor: interaction.user.tag,
                color: 0x57f287
            });

            return interaction.reply({ content: "▶️ Suspendierung aufgehoben.", ephemeral: true });

        } catch (err) {
            console.error("Fehler beim Aufheben der Suspendierung:", err);
            return interaction.reply({
                content: "❌ Fehler beim Aufheben der Suspendierung.",
                ephemeral: true
            });
        }
    }

    /**
     * =========================
     * SANKTIONIEREN
     * =========================
     */
    if (commandName === "sanktionieren") {
        const sanctions = loadSanctions();

        if (!sanctions[member.id]) sanctions[member.id] = [];

        const existingEntries = sanctions[member.id];
        const count = existingEntries.length;

        // Stufe basiert auf bisheriger Anzahl, max. 3
        const stufe = Math.min(count + 1, 3).toString();

        // Neue eindeutige ID vergeben
        const id = count > 0
            ? Math.max(...existingEntries.map(s => s.id)) + 1
            : 1;

        existingEntries.push({
            id,
            stufe,
            grund,
            moderator: interaction.user.tag,
            timestamp: Date.now()
        });

        saveSanctions(sanctions);

        // Alte Verwarnungsrollen entfernen, neue setzen
        const warnRoles = Object.values(verwarnungen);
        await member.roles.remove(warnRoles).catch(() => {});
        await member.roles.add(verwarnungen[stufe]).catch(() => {});

        await sendUpdate(member, {
            title: "⚠️ Sanktion",
            description: `<@${member.id}> hat eine **Verwarnung ${stufe}** erhalten.`,
            reason: grund,
            executor: interaction.user.tag,
            color: 0xffcc00
        });

        // Bei Stufe 3 → HR-Channel benachrichtigen + automatische Suspendierung
        if (stufe === "3") {
            // HR-Channel Embed
            try {
                const hrChannel = await client.channels.fetch(personalChannelId);
                if (hrChannel) {
                    const allSanctions = sanctions[member.id];
                    const hrEmbed = new EmbedBuilder()
                        .setColor(0xed4245)
                        .setTitle("🚨 Gesprächsbedarf – Dritte Sanktion")
                        .setThumbnail(FIB_LOGO)
                        .setDescription(
                            `<@${member.id}> hat die **dritte Sanktion** erhalten.\n\n` +
                            `Gemäß interner Regelung ist bei drei Sanktionen eine **Entlassung vorgesehen**.\n` +
                            `Bitte ein Gespräch mit dem Mitarbeiter vereinbaren.`
                        )
                        .addFields(
                            {
                                name: "📋 Übersicht aller Sanktionen",
                                value: allSanctions.map(s =>
                                    `**#${s.id} – Stufe ${s.stufe}**\n` +
                                    `Grund: ${s.grund}\n` +
                                    `Moderator: ${s.moderator}\n` +
                                    `Datum: <t:${Math.floor(s.timestamp / 1000)}:D>`
                                ).join("\n\n")
                            },
                            {
                                name: "⏸️ Status",
                                value: "Mitarbeiter wurde automatisch suspendiert (bis Gespräch).",
                                inline: false
                            }
                        )
                        .setFooter({ text: "Bitte zeitnah handeln." })
                        .setTimestamp();

                    await hrChannel.send({ embeds: [hrEmbed] });
                }
            } catch (err) {
                console.error("Fehler beim Senden in HR-Channel:", err);
            }

            // Automatische Suspendierung
            const suspensions = loadSuspensions();

            if (!suspensions[member.id]) {
                const removableRoles = getSuspendableRoles();
                const rolesToRemove = member.roles.cache
                    .filter(role => removableRoles.includes(role.id))
                    .map(role => role.id);

                if (rolesToRemove.length > 0) {
                    await member.roles.remove(rolesToRemove).catch(() => {});
                }
                await member.roles.add(suspendierung).catch(() => {});

                suspensions[member.id] = {
                    roles: rolesToRemove,
                    reason: "Automatische Suspendierung nach Verwarnung 3",
                    moderator: client.user.id,
                    timestamp: Date.now(),
                    expires: null
                };
                saveSuspensions(suspensions);

                await sendUpdate(member, {
                    title: "⏸️ Automatische Suspendierung",
                    description:
                        `<@${member.id}> wurde automatisch suspendiert (Verwarnung 3).\n⏱ Ende: Bis Gespräch` +
                        `\n\n🚫 **Ein Dienstantritt während der Suspendierung hat eine sofortige Entlassung zur Folge.**` +
                        `\n📩 Bitte melde dich beim **Office of HR** oder **Office of Administration**.`,
                    reason: "Automatische Suspendierung nach Verwarnung 3",
                    executor: client.user.tag,
                    color: 0xffaa00
                });
            }
        }

        return interaction.reply({
            content: stufe === "3"
                ? `⚠️ Sanktion ausgestellt → Verwarnung **${stufe}** + automatische Suspendierung`
                : `⚠️ Sanktion ausgestellt → Verwarnung **${stufe}**`,
            ephemeral: true
        });
    }

    /**
     * =========================
     * SANKTIONEN ANZEIGEN
     * =========================
     */
    if (commandName === "sanktionen") {
        const sanctions = loadSanctions();
        const entries = sanctions[member.id] || [];

        if (entries.length === 0) {
            return interaction.reply({
                content: "✅ Keine Sanktionen vorhanden.",
                ephemeral: true
            });
        }

        const embed = new EmbedBuilder()
            .setColor(0xffcc00)
            .setTitle(`Sanktionen von ${member.user.tag}`)
            .setDescription(
                entries.map(s =>
                    `**ID:** ${s.id}\n` +
                    `**Stufe:** ${s.stufe}\n` +
                    `**Grund:** ${s.grund}\n` +
                    `**Moderator:** ${s.moderator}\n` +
                    `**Datum:** <t:${Math.floor(s.timestamp / 1000)}:F>`
                ).join("\n\n")
            );

        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    /**
     * =========================
     * SANKTION LÖSCHEN
     * =========================
     */
    if (commandName === "sanktion_loeschen") {
        const sanctionId = interaction.options.getInteger("id");
        const sanctions = loadSanctions();

        if (!sanctions[member.id] || sanctions[member.id].length === 0) {
            return interaction.reply({
                content: "❌ Keine Sanktionen für diesen Mitarbeiter gefunden.",
                ephemeral: true
            });
        }

        const index = sanctions[member.id].findIndex(s => s.id === sanctionId);

        if (index === -1) {
            return interaction.reply({
                content: "❌ Sanktion mit dieser ID nicht gefunden.",
                ephemeral: true
            });
        }

        sanctions[member.id].splice(index, 1);

        const remaining = sanctions[member.id].length;

        // Verwarnungsrollen aktualisieren
        const warnRoles = Object.values(verwarnungen);
        await member.roles.remove(warnRoles).catch(() => {});

        if (remaining > 0) {
            const newStage = Math.min(remaining, 3).toString();
            await member.roles.add(verwarnungen[newStage]).catch(() => {});
        }

        saveSanctions(sanctions);

        return interaction.reply({
            content: `✅ Sanktion **${sanctionId}** gelöscht.`,
            ephemeral: true
        });
    }

    /**
     * =========================
     * ABTEILUNG ZUWEISEN
     * =========================
     */
    if (commandName === "abteilung_zuweisen") {
        const abteilungKey = interaction.options.getString("abteilung");
        const rangValue    = interaction.options.getString("rang");

        const abteilung = abteilungen[abteilungKey];
        if (!abteilung) {
            return interaction.reply({ content: "❌ Abteilung nicht gefunden.", ephemeral: true });
        }

        // Alle Rollen-IDs dieser Abteilung (außer "name")
        const abteilungRoles = Object.entries(abteilung)
            .filter(([key]) => key !== "name")
            .map(([, value]) => value);

        // Prüfen ob gewählter Rang zur Abteilung gehört
        if (!abteilungRoles.includes(rangValue)) {
            return interaction.reply({
                content: "❌ Dieser Rang gehört nicht zur gewählten Abteilung.",
                ephemeral: true
            });
        }

        // Bisherige Abteilungszugehörigkeit ermitteln (für Embed-Info)
        let previousDeptName = null;
        for (const [key, dept] of Object.entries(abteilungen)) {
            if (key === abteilungKey) continue;
            const deptRoles = Object.entries(dept)
                .filter(([k]) => k !== "name")
                .map(([, v]) => v);
            if (member.roles.cache.some(r => deptRoles.includes(r.id))) {
                previousDeptName = dept.name;
                // Alte Abteilungsrollen entfernen
                await member.roles.remove(deptRoles.filter(r => member.roles.cache.has(r))).catch(() => {});
            }
        }

        // Intelligence-Sonderregel: Wechsel zu IA → Intelligence-Rollen entfernen
        const INTEL_ROLES = ["1457036457737850933", "1457035617383878892"];
        if (abteilungKey === "internal_affairs") {
            await member.roles.remove(INTEL_ROLES).catch(() => {});
        }

        // Alle alten Ränge dieser Abteilung entfernen, dann office + neuen Rang geben
        await member.roles.remove(abteilungRoles.filter(r => member.roles.cache.has(r))).catch(() => {});
        await member.roles.add(abteilung.office).catch(() => {});
        await member.roles.add(rangValue).catch(() => {});

        // Rang-Name ermitteln für Embed
        const rangName = Object.entries(abteilung).find(([, v]) => v === rangValue)?.[0] || rangValue;

        // Beschreibung mit optionalem Wechsel-Hinweis
        let description = `<@${member.id}> wurde der Abteilung **${abteilung.name}** zugewiesen.\n📋 Rang: **${rangName}**`;
        if (previousDeptName) {
            description += `\n\n🔄 Wechselt von **${previousDeptName}** zu **${abteilung.name}**`;
        }

        await sendUpdate(member, {
            title: "🏢 Abteilungszuweisung",
            description,
            reason: grund,
            executor: interaction.user.tag,
            color: 0x5865f2
        });

        return interaction.reply({ content: `✅ Abteilung zugewiesen: **${abteilung.name}** | Rang: **${rangName}**`, ephemeral: true });
    }

    /**
     * =========================
     * ABTEILUNG ENTFERNEN
     * =========================
     */
    if (commandName === "abteilung_entfernen") {
        const abteilungKey = interaction.options.getString("abteilung");

        const abteilung = abteilungen[abteilungKey];
        if (!abteilung) {
            return interaction.reply({ content: "❌ Abteilung nicht gefunden.", ephemeral: true });
        }

        // Alle Rollen-IDs dieser Abteilung
        const abteilungRoles = Object.entries(abteilung)
            .filter(([key]) => key !== "name")
            .map(([, value]) => value);

        // Prüfen ob Member überhaupt in der Abteilung ist
        const hasAnyRole = abteilungRoles.some(r => member.roles.cache.has(r));
        if (!hasAnyRole) {
            return interaction.reply({
                content: `❌ <@${member.id}> ist kein Mitglied der Abteilung **${abteilung.name}**.`,
                ephemeral: true
            });
        }

        // Alle Abteilungsrollen entfernen
        await member.roles.remove(abteilungRoles.filter(r => member.roles.cache.has(r))).catch(() => {});

        // Intelligence-Sonderregel: Entfernen aus IA → Intelligence-Rollen zurückgeben
        const INTEL_ROLES = ["1457036457737850933", "1457035617383878892"];
        if (abteilungKey === "internal_affairs") {
            await member.roles.add(INTEL_ROLES).catch(() => {});
        }

        await sendUpdate(member, {
            title: "🏢 Abteilung entfernt",
            description: `<@${member.id}> wurde aus der Abteilung **${abteilung.name}** entfernt.`,
            reason: grund,
            executor: interaction.user.tag,
            color: 0xed4245
        });

        return interaction.reply({ content: `✅ Aus Abteilung **${abteilung.name}** entfernt.`, ephemeral: true });
    }
    /**
     * =========================
     * BESPRECHUNG ERSTELLEN
     * =========================
     */
    if (commandName === "besprechung_erstellen") {
        const titel = interaction.options.getString("titel");
        const datum = interaction.options.getString("datum");
        const uhrzeit = interaction.options.getString("uhrzeit");
        const info = interaction.options.getString("info");

        const zeitpunkt = parseDatumUhrzeit(datum, uhrzeit);

        if (!zeitpunkt) {
            return interaction.reply({
                content: "❌ Ungültiges Format. Nutze Datum `TT.MM.JJJJ` und Uhrzeit `HH:MM`.",
                ephemeral: true
            });
        }

        if (zeitpunkt <= Date.now()) {
            return interaction.reply({
                content: "❌ Der Zeitpunkt muss in der Zukunft liegen.",
                ephemeral: true
            });
        }

        const embed = new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle(`📅 ${titel}`)
            .setDescription(
                (info ? `${info}\n\n` : "") +
                `🕒 **Zeitpunkt:** <t:${Math.floor(zeitpunkt / 1000)}:F> (<t:${Math.floor(zeitpunkt / 1000)}:R>)\n\n` +
                `⚠️ Es herrscht Anzugspflicht. Bitte erscheinen Sie pünktlich. Falls Sie verhindert sind, melden Sie sich unten ab.\n\n` +
                `Im Rahmen der Besprechung werden Sie die Möglichkeit haben, Anliegen die das FIB betreffen anzusprechen. Bitte machen Sie sich diesbezüglich Gedanken.\n\n` +
                `Reagiere mit ${EMOJI_ANWESEND} für **Anwesend** oder ${EMOJI_NICHT_ANWESEND} für **Nicht Anwesend**.`
            )
            .setThumbnail(FIB_LOGO)
            .setFooter({ text: `Erstellt von ${interaction.user.tag}` })
            .setTimestamp();

        const abmeldenRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("abmeldung_button")
                .setLabel("Abmelden")
                .setEmoji("📩")
                .setStyle(ButtonStyle.Danger)
        );

        const zielChannel = await client.channels.fetch(besprechungChannelId).catch(() => null);
        if (!zielChannel) {
            return interaction.reply({
                content: "❌ Der konfigurierte Besprechungs-Channel wurde nicht gefunden. Prüfe `besprechungChannelId` in der config.json.",
                ephemeral: true
            });
        }

        const sentMessage = await zielChannel.send({ embeds: [embed], components: [abmeldenRow] });
        await sentMessage.react(EMOJI_ANWESEND);
        await sentMessage.react(EMOJI_NICHT_ANWESEND);

        const besprechungen = loadBesprechungen();
        besprechungen[sentMessage.id] = {
            channelId: sentMessage.channel.id,
            guildId: interaction.guild.id,
            titel,
            zeitpunkt,
            ersteller: interaction.user.id,
            erstellt: Date.now(),
            ausgewertet: false
        };
        saveBesprechungen(besprechungen);

        return interaction.reply({ content: "✅ Besprechung erstellt.", ephemeral: true });
    }

    /**
     * =========================
     * ABMELDEN
     * =========================
     */
    if (commandName === "abmelden") {
        const dauer = interaction.options.getString("dauer");
        const abmeldeGrund = interaction.options.getString("grund");

        const ms = parseDauer(dauer);
        if (!ms) {
            return interaction.reply({
                content: "❌ Ungültiges Dauer-Format. Nutze z. B. `3d`, `12h` oder `30m`.",
                ephemeral: true
            });
        }

        const abmeldungen = loadAbmeldungen();
        const userId = interaction.user.id;
        if (!abmeldungen[userId]) abmeldungen[userId] = [];

        const now = Date.now();
        const bereitsAktiv = getAktiveAbmeldung(abmeldungen, userId);
        if (bereitsAktiv) {
            return interaction.reply({
                content: `❌ Du bist bereits abgemeldet bis <t:${Math.floor(bereitsAktiv.ende / 1000)}:F>.`,
                ephemeral: true
            });
        }

        const ende = now + ms;
        const neuerEintrag = { start: now, ende, grund: abmeldeGrund };
        abmeldungen[userId].push(neuerEintrag);
        saveAbmeldungen(abmeldungen);

        await sendAbmeldungUpdate(interaction.user, neuerEintrag);

        return interaction.reply({
            content: `✅ Du bist abgemeldet bis <t:${Math.floor(ende / 1000)}:F> (<t:${Math.floor(ende / 1000)}:R>).\n📄 Grund: ${abmeldeGrund}`,
            ephemeral: true
        });
    }

    /**
     * =========================
     * ABMELDUNG STATUS
     * =========================
     */
    if (commandName === "abmeldung_status") {
        const target = interaction.options.getUser("mitarbeiter");
        const abmeldungen = loadAbmeldungen();
        const eintraege = (abmeldungen[target.id] || []).slice().sort((a, b) => b.start - a.start);

        if (eintraege.length === 0) {
            return interaction.reply({
                content: `✅ <@${target.id}> hat sich noch nie abgemeldet.`,
                ephemeral: true
            });
        }

        const gesamtDauerMs = eintraege.reduce((sum, e) => sum + (e.ende - e.start), 0);
        const aktiv = getAktiveAbmeldung(abmeldungen, target.id);

        const embed = new EmbedBuilder()
            .setColor(aktiv ? 0xffaa00 : 0x2b2d31)
            .setTitle(`Abmeldungen von ${target.tag}`)
            .setThumbnail(FIB_LOGO)
            .setDescription(
                (aktiv
                    ? `⏸️ **Aktuell abgemeldet** bis <t:${Math.floor(aktiv.ende / 1000)}:F>\n📄 Grund: ${aktiv.grund}\n\n`
                    : "✅ **Aktuell nicht abgemeldet**\n\n") +
                `📊 Insgesamt **${eintraege.length}** Abmeldung(en), gesamt **${formatDauer(gesamtDauerMs)}**`
            )
            .addFields(
                eintraege.slice(0, 10).map((e, i) => ({
                    name: `#${eintraege.length - i} – ${new Date(e.start).toLocaleDateString("de-DE")}`,
                    value: `⏱ ${formatDauer(e.ende - e.start)}\n📄 ${e.grund}`,
                    inline: true
                }))
            )
            .setTimestamp();

        if (eintraege.length > 10) {
            embed.setFooter({ text: "Nur die letzten 10 Einträge werden angezeigt." });
        }

        return interaction.reply({ embeds: [embed], ephemeral: true });
    }
});

client.login(process.env.DISCORD_TOKEN);