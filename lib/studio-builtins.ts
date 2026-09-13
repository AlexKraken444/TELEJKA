export const builtinLabels={publishPost:'Опубликовать пост из редактора',sendMessage:'Отправить сообщение из поля',saveProfile:'Сохранить данные профиля',savePlus:'Сохранить настройки TELEJKA+',refreshFeed:'Обновить ленту',newChat:'Открыть создание чата',compose:'Перейти к написанию поста',logout:'Выйти из аккаунта'} as const;
export const builtinNames=Object.keys(builtinLabels) as [keyof typeof builtinLabels,...(keyof typeof builtinLabels)[]];
export const tabLabels={feed:'Лента',chats:'Сообщения',people:'Люди',profile:'Профиль',plus:'TELEJKA+',rewards:'БАТОНчики'} as const;
