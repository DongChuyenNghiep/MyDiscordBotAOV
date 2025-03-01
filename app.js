import "dotenv/config";
import { Client, GatewayIntentBits } from "discord.js";
import axios from "axios";
import { GUILD_ID, API_TEAMS, API_USERS, CHECK_INTERVAL } from "./config.js";

const TOKEN = process.env.DISCORD_TOKEN;
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers
    ],
});

// Lưu dữ liệu team cũ để so sánh
let previousTeams = {};

async function fetchTeams() {
    try {
        const response = await axios.post(API_TEAMS, {}); 
        return response.data;
    } catch (error) {
        console.error("❌ Lỗi khi gọi API Teams:", error.message);
        return [];
    }
}

async function fetchUsers() {
    try {
        const response = await axios.post(API_USERS, {}); 
        return response.data;
    } catch (error) {
        console.error("❌ Lỗi khi gọi API Users:", error.message);
        return [];
    }
}

async function updateRoles(newTeams, updatedTeams) {
    const guild = await client.guilds.fetch(GUILD_ID);
    await guild.members.fetch(); // Fetch tất cả thành viên trong server

    const users = await fetchUsers(); 

    // Xử lý team mới
    for (const team of newTeams) {
        await assignRolesToTeam(team, users, guild);
    }

    // Xử lý team bị cập nhật (__v thay đổi)
    for (const team of updatedTeams) {
        await updateTeamRoles(team, users, guild);
    }
}

async function assignRolesToTeam(team, users, guild) {
    const { teamName, gameMembers } = team;
    if (!gameMembers || !gameMembers["Liên Quân Mobile"]) return;

    console.log(`\n🆕 Xử lý team mới: ${teamName}`);

    // 🔹 Fetch toàn bộ member trước khi kiểm tra
    await fetchAllMembers(guild);

    const members = gameMembers["Liên Quân Mobile"];

    for (const garenaaccount of members) {
        console.log(`🔍 Tìm garenaaccount: ${garenaaccount}`);

        const user = users.find(u => u.garenaaccount === garenaaccount);
        if (!user) {
            console.log(`❌ Không tìm thấy user với garenaaccount: ${garenaaccount}`);
            continue;
        }

        console.log(`✅ garenaaccount ${garenaaccount} khớp với Discord Username: ${user.discordID}`);

        // 🔹 Chuyển `discordID` thành ID số
        const discordMember = guild.members.cache.find(member => member.user.username === user.discordID);

        if (!discordMember) {
            console.log(`⚠️ Không tìm thấy thành viên ${user.discordID} trong server.`);
            continue;
        }

        console.log(`✅ Thành viên ${discordMember.user.username} (${discordMember.user.id}) có trong server. Thêm role.`);

        let gameRole = await getOrCreateRole(guild, "AOV Championship Participants", "BLUE");
        let teamRole = await getOrCreateRole(guild, teamName, "RED");

        await discordMember.roles.add([gameRole, teamRole]);
        console.log(`✅ Đã thêm role "${teamName}" cho ${discordMember.user.username}`);
    }
}


async function fetchAllMembers(guild) {
    try {
        console.log("🔄 Fetching all members in the server...");

        await guild.members.fetch(); // Fetch tất cả thành viên
        
        console.log(`✅ Fetch hoàn tất! Đã lấy ${guild.members.cache.size} thành viên.`);
        
        // In danh sách username và ID của tất cả thành viên
        guild.members.cache.forEach(member => {
            console.log(`👤 ${member.user.username} (${member.user.id})`);
        });

    } catch (error) {
        console.error("❌ Lỗi khi fetch toàn bộ thành viên:", error);
    }
}



async function updateTeamRoles(team, users, guild) {
    const prevTeam = previousTeams[team._id];
    if (!prevTeam) return;

    const { teamName, gameMembers } = team;
    const oldTeamName = prevTeam.teamName;
    const oldMembers = prevTeam.gameMembers ? prevTeam.gameMembers["Liên Quân Mobile"] || [] : [];

    if (!gameMembers || !gameMembers["Liên Quân Mobile"]) return;
    const newMembers = gameMembers["Liên Quân Mobile"];

    console.log(`\n🔄 Cập nhật team "${oldTeamName}" -> "${teamName}"`);

    // 🔹 Fetch lại toàn bộ thành viên trước khi cập nhật
    await fetchAllMembers(guild);

    // 🆕 Lấy hoặc tạo role mới
    const newTeamRole = await getOrCreateRole(guild, teamName, "RED");
    if (!newTeamRole) {
        console.log(`❌ Không thể tạo hoặc lấy role mới "${teamName}".`);
        return;
    }

    // 🆕 Thêm role mới TRƯỚC khi xóa role cũ
    for (const garenaaccount of newMembers) {
        console.log(`🔍 Tìm garenaaccount: ${garenaaccount}`);

        const user = users.find(u => u.garenaaccount === garenaaccount);
        if (!user) {
            console.log(`❌ Không tìm thấy user với garenaaccount: ${garenaaccount}`);
            continue;
        }

        console.log(`✅ garenaaccount ${garenaaccount} khớp với Discord Username: ${user.discordID}`);

        // 🔹 Chuyển `discordID` thành ID số hoặc tìm theo username
        let discordMember = guild.members.cache.get(user.discordID) || 
                            guild.members.cache.find(member => member.user.username === user.discordID);

        if (!discordMember) {
            console.log(`⚠️ Không tìm thấy thành viên ${user.discordID} trong server.`);
            continue;
        }

        console.log(`✅ Thành viên ${discordMember.user.username} (${discordMember.user.id}) có trong server. Thêm role.`);

        try {
            await discordMember.roles.add(newTeamRole);
            console.log(`✅ Đã thêm team mới "${teamName}" cho ${discordMember.user.username}`);
        } catch (error) {
            console.error(`❌ Lỗi khi add role "${teamName}" cho ${discordMember.user.username}:`, error);
        }
    }

    // 🛠 Xóa role cũ sau khi đã cập nhật role mới
    const oldTeamRole = guild.roles.cache.find(role => role.name === oldTeamName);
    if (oldTeamRole) {
        console.log(`🗑 Xóa role cũ "${oldTeamName}"`);
        await oldTeamRole.delete();
    }

    console.log(`✅ Hoàn tất cập nhật role cho team "${teamName}".`);
}



async function getOrCreateRole(guild, roleName, color) {
    let role = guild.roles.cache.find(r => r.name === roleName);
    if (!role) {
        try {
            role = await guild.roles.create({
                name: roleName,
                color: color === "RED" ? "#FF0000" : "#3498db", // 🔹 Đổi màu chữ thành mã HEX
                reason: "Auto-created for team update",
            });
            console.log(`✅ Role "${roleName}" đã được tạo.`);
        } catch (error) {
            console.error(`❌ Lỗi khi tạo role "${roleName}":`, error);
        }
    }
    return role;
}


async function checkForUpdates() {
    try {
        const teams = await fetchTeams();
        if (!teams || teams.length === 0) {
            console.log("❌ Không có dữ liệu team từ API.");
            return;
        }

        console.log(`🔍 Số team từ API: ${teams.length}`);

        const newTeams = teams.filter(team => !previousTeams[team._id]);
        const updatedTeams = teams.filter(team => previousTeams[team._id] && previousTeams[team._id].__v !== team.__v);

        console.log(`🆕 Phát hiện ${newTeams.length} team mới.`);
        console.log(`🔄 Phát hiện ${updatedTeams.length} team cập nhật.`);

        if (newTeams.length > 0 || updatedTeams.length > 0) {
            await updateRoles(newTeams, updatedTeams);
        }

        previousTeams = teams.reduce((acc, team) => {
            acc[team._id] = team;
            return acc;
        }, {});

    } catch (error) {
        console.error("❌ Lỗi khi kiểm tra team mới:", error);
    }
}

client.once("ready", async () => {
    console.log(`🤖 Bot đã đăng nhập với tên ${client.user.tag}`);

    const guild = await client.guilds.fetch(GUILD_ID);

    // Fetch tất cả thành viên ngay khi bot khởi động
    await fetchAllMembers(guild);

    setInterval(checkForUpdates, CHECK_INTERVAL);
});

client.login(TOKEN);
