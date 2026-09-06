async function findChats(client) {
    const dialogs = await client.getDialogs({
        limit: 100,
    });

    for (const dialog of dialogs) {
        const entity = dialog.entity;

        if (dialog.title === "DELETED MESSAGES" ||
            entity?.title === "DELETED MESSAGES" ||
            entity?.firstName === "DELETED MESSAGES"){
            console.log({
                title:
                    dialog.title ||
                    entity?.title ||
                    entity?.firstName ||
                    "Unknown",

                id: entity?.id?.toString(),

                className: entity?.className,
            });
        }


    }
}

module.exports = findChats;