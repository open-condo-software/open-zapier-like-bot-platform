function getInitialRules () {
    return [
        {
            'controller': 'telegram',
            'when': 'message',
            'case': '{{ chat.id and document.mime_type === "application/json" and document.file_size < 12300100 and document.file_name.startsWith("rules") and document.file_name.endsWith("json") }}',
            'do': [
                {
                    controller: 'telegram',
                    action: 'sendMessage',
                    as: 'sent',
                    args: {
                        chatId: '{{ chat.id }}',
                        text: 'applying rules ...',
                    },
                },
                {
                    controller: 'telegram',
                    action: 'readFile',
                    as: 'rulesText',
                    args: {
                        fileId: '{{ document.file_id }}',
                    },
                },
                {
                    controller: '_rule',
                    action: '_updateRules',
                    as: 'rules',
                    args: {
                        namespace: '{{ chat.username or chat.id }}',
                        rules: '{{ rulesText }}',
                        _message: 'apply rules: {{ message_id }} from {{ from.id }} / {{ from.username }}',
                    },
                },
            ],
        },
    ]
}

module.exports = {
    getInitialRules,
}