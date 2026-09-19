ALTER TABLE users ADD COLUMN IF NOT EXISTS mini_until timestamptz;
CREATE OR REPLACE FUNCTION telejka_user(uid uuid,viewer uuid) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object('medals',telejka_medals(uid),'follower_count',(SELECT count(*)::int FROM follows WHERE followed=uid),'id',u.id,'name',u.name,'color',u.color,'verified',u.verified,
 'avatar',CASE WHEN telejka_can_view(uid,viewer) THEN u.avatar ELSE NULL END,
 'bio',CASE WHEN telejka_can_view(uid,viewer) THEN u.bio ELSE '' END,
 'name_color',CASE WHEN u.plus_until>now() THEN u.name_color ELSE NULL END,
 'mini_active',COALESCE(u.mini_until>now(),false),'plus_active',COALESCE(u.plus_until>now(),false),'is_private',u.is_private,
 'can_view',telejka_can_view(uid,viewer),
 'blocked',EXISTS(SELECT 1 FROM user_blocks b WHERE b.user_id=viewer AND b.blocked_id=uid)) FROM users u WHERE u.id=uid
$$;
