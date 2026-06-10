// commands.js
const { SlashCommandBuilder } = require('discord.js');

const commands = [
    new SlashCommandBuilder()
        .setName('einstellen')
        .setDescription('Stellt einen neuen Mitarbeiter ein.')
        .addUserOption(opt => opt
            .setName('mitarbeiter')
            .setDescription('Der Mitarbeiter, den du einstellen möchtest.')
            .setRequired(true)
        )
        .addRoleOption(opt => opt
            .setName('dienstgrad')
            .setDescription('Der Dienstgrad des neuen Mitarbeiters.')
            .setRequired(true)
        )
        .addStringOption(opt => opt
            .setName('grund')
            .setDescription('Der Grund für die Einstellung.')
            .setRequired(false)
        ),

    new SlashCommandBuilder()
        .setName('entlassen')
        .setDescription('Entlässt einen Mitarbeiter.')
        .addUserOption(opt => opt
            .setName('mitarbeiter')
            .setDescription('Der Mitarbeiter, den du entlassen möchtest.')
            .setRequired(true)
        )
        .addStringOption(opt => opt
            .setName('grund')
            .setDescription('Der Grund für die Entlassung.')
            .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName('befoerdern')
        .setDescription('Befördert einen Mitarbeiter.')
        .addUserOption(opt => opt
            .setName('mitarbeiter')
            .setDescription('Der Mitarbeiter, den du befördern möchtest.')
            .setRequired(true)
        )
        .addRoleOption(opt => opt
            .setName('dienstgrad')
            .setDescription('Der neue Dienstgrad des Mitarbeiters.')
            .setRequired(true)
        )
        .addStringOption(opt => opt
            .setName('grund')
            .setDescription('Der Grund für die Beförderung.')
            .setRequired(false)
        ),

    new SlashCommandBuilder()
        .setName('degradieren')
        .setDescription('Degradiert einen Mitarbeiter.')
        .addUserOption(opt => opt
            .setName('mitarbeiter')
            .setDescription('Der Mitarbeiter, den du degradieren möchtest.')
            .setRequired(true)
        )
        .addRoleOption(opt => opt
            .setName('dienstgrad')
            .setDescription('Der neue Dienstgrad des Mitarbeiters.')
            .setRequired(true)
        )
        .addStringOption(opt => opt
            .setName('grund')
            .setDescription('Der Grund für die Degradierung.')
            .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName('abteilung_zuweisen')
        .setDescription('Weist einem Mitarbeiter eine Abteilung und einen Rang zu.')
        .addUserOption(opt => opt
            .setName('mitarbeiter')
            .setDescription('Der Mitarbeiter, dem du eine Abteilung zuweisen möchtest.')
            .setRequired(true)
        )
        .addStringOption(opt => opt
            .setName('abteilung')
            .setDescription('Abteilung auswählen')
            .setRequired(true)
            .addChoices(
                { name: "Internal Affairs",    value: "internal_affairs"    },
                { name: "Human Resources",     value: "human_resources"     },
                { name: "Hostage Rescue Team", value: "hostage_rescue_team" },
                { name: "Intelligence",        value: "intelligence"        }
            )
        )
        .addStringOption(opt => opt
            .setName('rang')
            .setDescription('Rang innerhalb der Abteilung auswählen')
            .setRequired(true)
            .addChoices(
                // Internal Affairs
                { name: "IA – Lead",                         value: "1456772033290436691" },
                { name: "IA – Stv. Lead",                    value: "1458589597943726110" },
                { name: "IA – Senior IA Investigator",       value: "1458589712301424692" },
                { name: "IA – IA Investigator",              value: "1458589808254517412" },
                { name: "IA – IA Probationary Investigator", value: "1458589935077560404" },
                { name: "IA – Member",                       value: "1456772225855393934" },
                // Human Resources
                { name: "HR – Lead",                         value: "1456776873060335779" },
                { name: "HR – Recruiter",                    value: "1456964719779909662" },
                { name: "HR – Instructor",                   value: "1456782213306912859" },
                // Hostage Rescue Team
                { name: "HRT – Lead",                        value: "1457036069034918003" },
                { name: "HRT – Member",                      value: "1457036409402818814" },
                // Intelligence
                { name: "Intel – Lead",                      value: "1457036468898889929" },
                { name: "Intel – Officer",                   value: "1457036457737850933" }
            )
        )
        .addStringOption(opt => opt
            .setName('grund')
            .setDescription('Der Grund für die Zuweisung.')
            .setRequired(false)
        ),

    new SlashCommandBuilder()
        .setName('abteilung_entfernen')
        .setDescription('Entfernt einen Mitarbeiter aus einer Abteilung.')
        .addUserOption(opt => opt
            .setName('mitarbeiter')
            .setDescription('Der Mitarbeiter, dem du eine Abteilung entfernen möchtest.')
            .setRequired(true)
        )
        .addStringOption(opt => opt
            .setName('abteilung')
            .setDescription('Die Abteilung, aus der der Mitarbeiter entfernt werden soll.')
            .setRequired(true)
            .addChoices(
                { name: "Internal Affairs",    value: "internal_affairs"    },
                { name: "Human Resources",     value: "human_resources"     },
                { name: "Hostage Rescue Team", value: "hostage_rescue_team" },
                { name: "Intelligence",        value: "intelligence"        }
            )
        )
        .addStringOption(opt => opt
            .setName('grund')
            .setDescription('Der Grund für die Entfernung.')
            .setRequired(false)
        ),

    new SlashCommandBuilder()
        .setName('suspendieren')
        .setDescription('Suspendiert einen Mitarbeiter.')
        .addUserOption(opt => opt
            .setName('mitarbeiter')
            .setDescription('Der Mitarbeiter, den du suspendieren möchtest.')
            .setRequired(true)
        )
        .addStringOption(opt => opt
            .setName('grund')
            .setDescription('Grund der Suspendierung.')
            .setRequired(true)
        )
        .addUserOption(opt => opt
            .setName('ansprechpartner')
            .setDescription('Person, bei der sich der Mitarbeiter melden muss.')
            .setRequired(true)
        )
        .addStringOption(opt => opt
            .setName('dauer')
            .setDescription('z. B. 7d, 12h, 30m (leer = bis Gespräch)')
            .setRequired(false)
        ),

    new SlashCommandBuilder()
        .setName('suspendierung_aufheben')
        .setDescription('Hebt die Suspendierung eines Mitarbeiters auf.')
        .addUserOption(opt => opt
            .setName('mitarbeiter')
            .setDescription('Der Mitarbeiter, dessen Suspendierung du aufheben möchtest.')
            .setRequired(true)
        )
        .addStringOption(opt => opt
            .setName('grund')
            .setDescription('Der Grund für die Aufhebung.')
            .setRequired(false)
        ),

    new SlashCommandBuilder()
        .setName('sanktionieren')
        .setDescription('Stelle einem Mitarbeiter eine Sanktion aus.')
        .addUserOption(opt => opt
            .setName('mitarbeiter')
            .setDescription('Der Mitarbeiter, dem du eine Sanktion ausstellen möchtest.')
            .setRequired(true)
        )
        .addStringOption(opt => opt
            .setName('grund')
            .setDescription('Grund der Sanktion.')
            .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName('sanktionen')
        .setDescription('Zeige die Sanktionen eines Mitarbeiters an.')
        .addUserOption(opt => opt
            .setName('mitarbeiter')
            .setDescription('Der Mitarbeiter, dessen Sanktionen angezeigt werden sollen.')
            .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName('sanktion_loeschen')
        .setDescription('Lösche eine Sanktion eines Mitarbeiters.')
        .addUserOption(opt => opt
            .setName('mitarbeiter')
            .setDescription('Der Mitarbeiter, dessen Sanktion gelöscht werden soll.')
            .setRequired(true)
        )
        .addIntegerOption(opt => opt
            .setName('id')
            .setDescription('ID der Sanktion (aus /sanktionen).')
            .setRequired(true)
        ),
]
.map(cmd => cmd.toJSON());

module.exports = { commands };