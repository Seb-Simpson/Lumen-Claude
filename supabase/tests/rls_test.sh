#!/usr/bin/env bash
# Run against a local Postgres loaded with supabase-stub.sql then ../setup.sql.
# Behaviour tests for supabase/setup.sql's security rules.
P="psql -h ${PGHOST:-/tmp/pglumen} -p ${PGPORT:-55432} -U postgres -d lumen -qtAX"
pass=0; fail=0
A=11111111-1111-1111-1111-111111111111; Bb=22222222-2222-2222-2222-222222222222
as() { # as <who> <sql>  -> runs as anon or a user id
  local who=$1; shift
  if [ "$who" = anon ]; then $P -c "set role anon; $*" 2>&1
  else $P -c "set role authenticated; set request.jwt.claim.sub = '$who'; $*" 2>&1; fi
}
check() { # check <name> <expected-regex> <actual>
  if { [ "$2" = '^$' ] && [ -z "$3" ]; } || { [ -n "$3" ] && printf '%s' "$3" | grep -Eq "$2"; }; then pass=$((pass+1)); echo "  ok   $1"; else fail=$((fail+1)); echo "  FAIL $1 -> got: $3"; fi
}
$P -c "insert into auth.users(id, raw_user_meta_data) values ('$A', '{\"username\":\"alice\",\"display_name\":\"Alice A\",\"color\":\"#7c3aed\"}'), ('$Bb', '{\"username\":\"Bob_1\",\"display_name\":\"Bob\"}')" >/dev/null
echo "Accounts"
check "profile created on sign-up" '^alice\|Alice A\|A\|#7c3aed$' "$($P -c "select username, display_name, initial, color from profiles where id='$A'")"
check "username lower-cased" '^bob_1$' "$($P -c "select username from profiles where id='$Bb'")"
check "invalid username rejected" 'violates check constraint' "$($P -c "insert into auth.users(raw_user_meta_data) values ('{\"username\":\"bad name!\",\"display_name\":\"X\"}')" 2>&1)"
check "duplicate username rejected" 'duplicate key' "$($P -c "insert into auth.users(raw_user_meta_data) values ('{\"username\":\"alice\",\"display_name\":\"X\"}')" 2>&1)"
check "anyone can read profiles" '^2$' "$(as anon "select count(*) from profiles")"
check "edit own profile" 'UPDATE 1' "$(as $A "update profiles set display_name='Alice B' where id='$A'" ; $P -c "select 'UPDATE ' || count(*) from profiles where display_name='Alice B'")"
check "can't edit someone else's profile" '^$' "$(as $A "update profiles set display_name='hacked' where id='$Bb' returning 1")"
check "  ...and their profile is unchanged" '^Bob$' "$($P -c "select display_name from profiles where id='$Bb'")"
check "can't change username" 'permission denied' "$(as $A "update profiles set username='admin' where id='$A'")"
check "bad avatar color rejected" 'violates check constraint' "$(as $A "update profiles set color='red;x' where id='$A'")"

echo "Videos"
V1=aaaaaaaa-0000-0000-0000-000000000001; V2=aaaaaaaa-0000-0000-0000-000000000002
check "upload to own folder" '^1$' "$(as $A "insert into videos(id,title,category,visibility,video_path) values ('$V1','Pub','Music','public','$A/$V1.mp4') returning 1")"
as $A "insert into videos(id,title,category,visibility,video_path) values ('$V2','Priv','Music','private','$A/$V2.mp4')" >/dev/null
check "can't point at someone else's file" 'row-level security' "$(as $A "insert into videos(title,category,video_path) values ('x','Music','$Bb/x.mp4')")"
check "can't upload as someone else" 'permission denied|row-level security' "$(as $A "insert into videos(owner_id,title,category,video_path) values ('$Bb','x','Music','$Bb/x.mp4')")"
check "can't set own view count" 'permission denied' "$(as $A "insert into videos(title,category,video_path,views) values ('x','Music','$A/x.mp4',999999)")"
check "anon can't upload" 'permission denied|row-level security' "$(as anon "insert into videos(title,category,video_path) values ('x','Music','x/x.mp4')")"
check "bad category rejected" 'violates check constraint' "$(as $A "insert into videos(title,category,video_path) values ('x','Cooking','$A/y.mp4')")"
check "visitors see public only" '^Pub$' "$(as anon "select title from videos")"
check "others can't see private" '^Pub$' "$(as $Bb "select title from videos order by title")"
check "owner sees private" '^Priv,Pub$' "$(as $A "select string_agg(title, ',' order by title) from videos")"
check "can't edit someone else's video" '^$' "$(as $Bb "update videos set title='hacked' where id='$V1' returning 1")"
check "  ...and the title is unchanged" '^Pub$' "$($P -c "select title from videos where id='$V1'")"
check "can't bump views directly" 'permission denied' "$(as $A "update videos set views=1000 where id='$V1'")"
as anon "select increment_view('$V1'); select increment_view('$V1'); select increment_view('$V2')" >/dev/null
check "view counter works (public only)" '^2\|0$' "$($P -c "select (select views from videos where id='$V1') || '|' || (select views from videos where id='$V2')")"

echo "Comments"
check "comment on public video" '^1$' "$(as $Bb "insert into comments(video_id, body) values ('$V1','Nice!') returning 1")"
check "comment on built-in sample video" '^1$' "$(as $Bb "insert into comments(video_id, body) values ('v-aurora','Love it') returning 1")"
check "can't comment on private video" 'row-level security' "$(as $Bb "insert into comments(video_id, body) values ('$V2','sneaky')")"
check "can't comment on made-up id" 'row-level security' "$(as $Bb "insert into comments(video_id, body) values ('nonsense','x')")"
check "anon can't comment" 'permission denied|row-level security' "$(as anon "insert into comments(video_id, body) values ('v-aurora','x')")"
check "empty comment rejected" 'violates check constraint' "$(as $Bb "insert into comments(video_id, body) values ('v-aurora','   ')")"
C1=$($P -c "select id from comments where body='Love it'")
check "reply to a comment" '^1$' "$(as $A "insert into comments(video_id, parent_id, body) values ('v-aurora','$C1','Thanks') returning 1")"
R1=$($P -c "select id from comments where body='Thanks'")
check "no replies to replies" 'one level deep' "$(as $Bb "insert into comments(video_id, parent_id, body) values ('v-aurora','$R1','deep')")"
check "reply must be on same video" 'one level deep' "$(as $Bb "insert into comments(video_id, parent_id, body) values ('$V1','$C1','wrong video')")"
check "can't spoof author" 'permission denied' "$(as $Bb "insert into comments(video_id, author_id, body) values ('v-aurora','$A','fake')")"
check "visitors can read comments" '^3$' "$(as anon "select count(*) from comments")"
check "can't delete someone else's comment" '^$' "$(as $A "delete from comments where body='Love it' returning 1")"
check "  ...and the comment still exists" '^1$' "$($P -c "select count(*) from comments where body='Love it'")"
check "video owner can delete comments on own video" '^1$' "$(as $A "delete from comments where body='Nice!' returning 1")"
check "like a comment" '^1$' "$(as $A "insert into comment_likes(comment_id) values ('$C1') returning 1")"
check "can't like twice" 'duplicate key' "$(as $A "insert into comment_likes(comment_id) values ('$C1')")"

echo "Ratings & subscriptions"
check "like a video" '^1$' "$(as $Bb "insert into video_ratings(video_id, value) values ('v-aurora', 1) returning 1")"
check "switch like to dislike" '^-1$' "$(as $Bb "insert into video_ratings(video_id, value) values ('v-aurora', -1) on conflict (video_id, user_id) do update set value = excluded.value returning value")"
check "can't rate private video" 'row-level security' "$(as $Bb "insert into video_ratings(video_id, value) values ('$V2', 1)")"
check "bad rating value rejected" 'violates check constraint' "$(as $A "insert into video_ratings(video_id, value) values ('v-aurora', 5)")"
check "subscribe" '^1$' "$(as $Bb "insert into subscriptions(channel_id) values ('$A') returning 1")"
check "visitors can count subscribers" '^1$' "$(as anon "select count(*) from subscriptions where channel_id='$A'")"
check "can't remove someone else's subscription" '^$' "$(as $A "delete from subscriptions returning 1")"
check "  ...and the subscription still exists" '^1$' "$($P -c "select count(*) from subscriptions")"

echo "Playlists & reports"
check "create playlist" '^1$' "$(as $Bb "insert into playlists(name, video_ids) values ('Mine', '{v-aurora}') returning 1")"
check "playlists are private" '^0$' "$(as $A "select count(*) from playlists")"
check "anon can't see playlists" '^0$|permission denied' "$(as anon "select count(*) from playlists")"
check "rename updates timestamp" '^t$' "$(as $Bb "update playlists set name='Renamed' returning updated_at > created_at")"
check "file a report" '^1$' "$(as $Bb "insert into reports(video_id, reason) values ('$V1','spam') returning 1")"
check "reports are not readable by users" '^0$' "$(as $Bb "select count(*) from reports")"

echo "Storage"
check "upload file to own folder" '^1$' "$(as $A "insert into storage.objects(bucket_id, name) values ('videos', '$A/$V1.mp4') returning 1")"
check "can't upload to someone else's folder" 'row-level security' "$(as $A "insert into storage.objects(bucket_id, name) values ('videos', '$Bb/evil.mp4')")"
check "can't upload to other buckets" 'row-level security' "$(as $A "insert into storage.objects(bucket_id, name) values ('other', '$A/x')")"
check "can't delete someone else's file" '^$' "$(as $Bb "delete from storage.objects returning 1")"
check "  ...and the file still exists" '^1$' "$($P -c "select count(*) from storage.objects")"
check "buckets configured" '^thumbnails\|5242880,videos\|52428800$' "$($P -c "select string_agg(id || '|' || file_size_limit, ',' order by id) from storage.buckets")"

echo "Deleting a video"
as $Bb "insert into video_ratings(video_id, value) values ('$V1', 1); insert into comments(video_id, body) values ('$V1','bye')" >/dev/null
check "owner deletes video" '^1$' "$(as $A "delete from videos where id='$V1' returning 1")"
check "its comments, ratings and reports are cleaned up" '^0\|0\|0$' "$($P -c "select (select count(*) from comments where video_id='$V1') || '|' || (select count(*) from video_ratings where video_id='$V1') || '|' || (select count(*) from reports where video_id='$V1')")"
check "deleting an account removes their data" '^0$' "$($P -c "delete from auth.users where id='$Bb'; select count(*) from comments c join profiles p on p.id=c.author_id where p.username='bob_1'")"

echo; echo "$pass passed, $fail failed"; [ $fail = 0 ]
