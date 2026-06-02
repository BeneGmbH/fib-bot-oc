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
            .setDescription('Der Grund für die Beförderung.')
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
            .setDescription('Der Grund für die Degradiertung.')
            .setRequired(true)
        ),
    
    new SlashCommandBuilder()
        .setName('abteilung_zuweisen')
        .setDescription('Weist einem Mitarbeiter eine Abteilung zu.')
        .addUserOption(opt => opt
            .setName('mitarbeiter')
            .setDescription('Der Mitarbeiter, dem du eine Abteilung zuweisen möchtest.')
            .setRequired(true)
        )
        .addStringOption(opt =>
            opt.setName("abteilung")
                .setDescription("Abteilung auswählen")
                .setRequired(true)
                .addChoices(
                    { name: "Internal Affairs", value: "internal_affairs" },
                    { name: "Human Resources", value: "human_resources" },
                    { name: "Hostage Rescue Team", value: "hostage_rescue_team" },
                    { name: "Intelligence", value: "intelligence" }
                )
        ),

    new SlashCommandBuilder()
        .setName('abteilung_entfernen')
        .setDescription('Entfernt einem Mitarbeiter eine Abteilung.')
        .addUserOption(opt => opt
            .setName('mitarbeiter')            
            .setDescription('Der Mitarbeiter, dem du eine Abteilung entfernen möchtest.')
            .setRequired(true)
        )
        .addStringOption(opt => opt
            .setName('abteilung')
            .setDescription('Die Abteilung, die du dem Mitarbeiter entfernen möchtest.')
            .setRequired(true)
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
        .addStringOption(opt => opt
            .setName("dauer")
            .setDescription("z. B. 7d, 12h, 30m (leer = bis Gespräch)")
            .setRequired(false)
        ),

    new SlashCommandBuilder()
        .setName('suspendierung_entfernen')
        .setDescription('Hebt die Suspendierung eines Mitarbeiters auf.')
        .addUserOption(opt => opt
            .setName('mitarbeiter')
            .setDescription('Der Mitarbeiter, dessen Suspendierung du aufheben möchtest.')
            .setRequired(true)
        )

]
.map(cmd => cmd.toJSON());

module.exports = { commands };