import AsyncStorage from "@react-native-async-storage/async-storage";

import TextRecognition from "@react-native-ml-kit/text-recognition";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useFonts } from "expo-font";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useRef, useState } from "react";
import {
    Animated,
    Dimensions,
    Easing,
    Image,
    ImageBackground,
    LayoutAnimation,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    UIManager,
    View
} from "react-native";

WebBrowser.maybeCompleteAuthSession();

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}


const SONGS_BEFORE_GENRE_SWITCH = 2;
const SPOTIFY_CLIENT_ID = "5c6044e666b741b980c9821508f65443";
const SPOTIFY_AUTHORIZE_ENDPOINT = "https://accounts.spotify.com/authorize";
const SPOTIFY_TOKEN_ENDPOINT = "https://accounts.spotify.com/api/token";
const SPOTIFY_WEB_REDIRECT_URI = "https://spotify.tdmgym.co.uk/";
const SPOTIFY_APP_RETURN_URI = "gymnfctest://";
const SPOTIFY_SCOPES = [
    "user-read-playback-state",
    "user-modify-playback-state",
    "streaming",
];
const WAVE_BAR_COUNT = 100;
const SPOTIFY_STORAGE_KEY = "spotify_session";
const SCANNED_IDS_KEY = "scanned_members";
const VOTE_HISTORY_KEY = "vote_history";
const SPOTIFY_CROSSFADE_MS = 7000;
const CROSSFADE_SAFE_COMPLETION_WINDOW_MS = SPOTIFY_CROSSFADE_MS + 5000;
const PRE_SWITCH_BUFFER_MS = 2000;
const MIN_COMPLETION_RATIO = 0.9;
const MIN_PLAYED_WITHOUT_DURATION_MS = 45000;
const MEMBER_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour
const RETURN_WINDOW_MS = 30 * 1000; // 30 seconds
const IDLE_ATTRACT_DELAY_MS = 60 * 1000; // 1 minute
const WEB_PREVIEW_TRACK = {
    name: "FE!N",
    artist: "Travis Scott, Playboi Carti",
    nextName: "B.O.T.A. (Baddest Of Them All)",
    nextArtist: "Eliza Rose, Interplanetary Criminal",
    durationMs: 201000,
    startProgressMs: 64000,
};
const INITIAL_PLAYLISTS = [
    {
        id: 1,
        name: "US Rap",
        votes: 0,
        uri: "spotify:playlist:2Yo3UTLrm3hzCVoU5Olz4m",
    },
    {
        id: 2,
        name: "D&B",
        votes: 0,
        uri: "spotify:playlist:0dAQ9Bk6xmi8keUcyRwhXc",
    },
    {
        id: 3,
        name: "ROCK AND METAL",
        votes: 0,
        uri: "spotify:playlist:5oVeob1LuLEDdTFmUSkkQ5",
    },
    {
        id: 4,
        name: "TECH HOUSE",
        votes: 0,
        uri: "spotify:playlist:3ErGblZL1xSUmp9utwjMqf",
    },
    {
        id: 5,
        name: "COUNTRY",
        votes: 0,
        uri: "spotify:playlist:0wZ6OL3E3j2E2udKInGYGl",
    },
    {
        id: 6,
        name: "R&B",
        votes: 0,
        uri: "spotify:playlist:45hhpyHDrRtOsFbZPA6yXd",
    },
];

type AccessState = "scanning" | "manual" | "invalid" | "voting";

type Playlist = {
    id: number;
    name: string;
    votes: number;
    uri: string;
};

type SpotifySession = {
    accessToken: string;
    refreshToken: string | null;
    expiresAt: number;
};

type VoteHistoryEntry = {
    time: string;
    votes: { name: string; votes: number }[];
};

type MemberRecord = {
    scannedAt: number;
    votedGenre: boolean;
    votedVolume: "up" | "down" | null;
};

function clonePlaylists() {
    return INITIAL_PLAYLISTS.map((playlist) => ({ ...playlist }));
}

function randomState(length = 32) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let out = "";

    for (let index = 0; index < length; index += 1) {
        out += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    return out;
}

function parseUrlParams(rawUrl: string) {
    const url = new URL(rawUrl);
    const params = new URLSearchParams(url.search);
    const hash = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;

    if (hash) {
        const hashParams = new URLSearchParams(hash);
        hashParams.forEach((value, key) => {
            if (!params.has(key)) {
                params.set(key, value);
            }
        });
    }

    return params;
}

function base64UrlEncode(input: ArrayBuffer | Uint8Array) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    let binary = "";

    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }

    // btoa is available in the JS runtime used by Expo.
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function rightRotate(value: number, bits: number) {
    return (value >>> bits) | (value << (32 - bits));
}

function sha256Bytes(message: string) {
    const bytes = new TextEncoder().encode(message);
    const bitLength = bytes.length * 8;
    const paddedLength = bytes.length + 1 + ((64 - ((bytes.length + 1 + 8) % 64)) % 64) + 8;
    const data = new Uint8Array(paddedLength);
    data.set(bytes);
    data[bytes.length] = 0x80;

    // Append original message length as 64-bit big-endian integer.
    const high = Math.floor(bitLength / 0x100000000);
    const low = bitLength >>> 0;
    data[paddedLength - 8] = (high >>> 24) & 0xff;
    data[paddedLength - 7] = (high >>> 16) & 0xff;
    data[paddedLength - 6] = (high >>> 8) & 0xff;
    data[paddedLength - 5] = high & 0xff;
    data[paddedLength - 4] = (low >>> 24) & 0xff;
    data[paddedLength - 3] = (low >>> 16) & 0xff;
    data[paddedLength - 2] = (low >>> 8) & 0xff;
    data[paddedLength - 1] = low & 0xff;

    const k = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
    ];

    const hash = [
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
        0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
    ];

    const w = new Uint32Array(64);

    for (let chunk = 0; chunk < data.length; chunk += 64) {
        for (let i = 0; i < 16; i += 1) {
            const offset = chunk + i * 4;
            w[i] = ((data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3]) >>> 0;
        }

        for (let i = 16; i < 64; i += 1) {
            const s0 = rightRotate(w[i - 15], 7) ^ rightRotate(w[i - 15], 18) ^ (w[i - 15] >>> 3);
            const s1 = rightRotate(w[i - 2], 17) ^ rightRotate(w[i - 2], 19) ^ (w[i - 2] >>> 10);
            w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
        }

        let a = hash[0];
        let b = hash[1];
        let c = hash[2];
        let d = hash[3];
        let e = hash[4];
        let f = hash[5];
        let g = hash[6];
        let h = hash[7];

        for (let i = 0; i < 64; i += 1) {
            const s1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
            const ch = (e & f) ^ (~e & g);
            const temp1 = (h + s1 + ch + k[i] + w[i]) >>> 0;
            const s0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
            const maj = (a & b) ^ (a & c) ^ (b & c);
            const temp2 = (s0 + maj) >>> 0;

            h = g;
            g = f;
            f = e;
            e = (d + temp1) >>> 0;
            d = c;
            c = b;
            b = a;
            a = (temp1 + temp2) >>> 0;
        }

        hash[0] = (hash[0] + a) >>> 0;
        hash[1] = (hash[1] + b) >>> 0;
        hash[2] = (hash[2] + c) >>> 0;
        hash[3] = (hash[3] + d) >>> 0;
        hash[4] = (hash[4] + e) >>> 0;
        hash[5] = (hash[5] + f) >>> 0;
        hash[6] = (hash[6] + g) >>> 0;
        hash[7] = (hash[7] + h) >>> 0;
    }

    const out = new Uint8Array(32);
    for (let i = 0; i < 8; i += 1) {
        out[i * 4] = (hash[i] >>> 24) & 0xff;
        out[i * 4 + 1] = (hash[i] >>> 16) & 0xff;
        out[i * 4 + 2] = (hash[i] >>> 8) & 0xff;
        out[i * 4 + 3] = hash[i] & 0xff;
    }

    return out;
}

async function createPkcePair() {
    const verifier = randomState(64);

    let digestBytes: Uint8Array;
    if (globalThis.crypto?.subtle) {
        const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
        digestBytes = new Uint8Array(digest);
    } else {
        digestBytes = sha256Bytes(verifier);
    }

    return {
        verifier,
        challenge: base64UrlEncode(digestBytes),
        method: "S256" as const,
    };
}

function getWinningPlaylist(playlists: Playlist[]) {
    return playlists.reduce((winner, playlist) =>
        playlist.votes > winner.votes ? playlist : winner
    );
}

function MarqueeText({ text, style }: { text: string; style: any }) {
    const containerRef = useRef<any>(null);
    const textRef = useRef<any>(null);
    const scrollAnim = useRef(new Animated.Value(0)).current;
    const [shouldScroll, setShouldScroll] = useState(false);
    const [animDuration, setAnimDuration] = useState(5);
    const [nativeDistance, setNativeDistance] = useState(0);
    const [nativeContainerWidth, setNativeContainerWidth] = useState(0);
    const [nativeTextWidth, setNativeTextWidth] = useState(0);

    // Web measurement
    useEffect(() => {
        if (Platform.OS !== "web") return;

        const measure = () => {
            const containerEl = containerRef.current;
            const textEl = textRef.current;
            if (!containerEl || !textEl) return;

            const cw = containerEl.clientWidth || 0;
            // Reset to block to measure natural overflow
            textEl.style.display = "block";
            textEl.style.overflow = "hidden";
            textEl.style.animation = "none";
            const tw = textEl.scrollWidth || 0;

            if (tw > cw + 20 && cw > 0) {
                setShouldScroll(true);
                setAnimDuration(Math.max(4, (tw - cw) / 25));
            } else {
                setShouldScroll(false);
            }
        };

        const timeout = setTimeout(measure, 300);
        return () => clearTimeout(timeout);
    }, [text]);

    // Native animation
    useEffect(() => {
        if (Platform.OS === "web") return;

        // Reset scroll position when text changes
        scrollAnim.setValue(0);

        if (nativeContainerWidth === 0 || nativeTextWidth === 0) {
            setNativeDistance(0);
            return;
        }

        const dist = nativeTextWidth - nativeContainerWidth;
        if (dist <= 20) {
            setNativeDistance(0);
            return;
        }

        setNativeDistance(dist + 20);
    }, [nativeTextWidth, nativeContainerWidth, text]);

    useEffect(() => {
        if (Platform.OS === "web" || nativeDistance <= 0) {
            scrollAnim.setValue(0);
            return;
        }

        scrollAnim.setValue(0);
        const scrollDuration = Math.min(nativeDistance * 40, 4000);
        const animation = Animated.loop(
            Animated.sequence([
                Animated.delay(1000),
                Animated.timing(scrollAnim, {
                    toValue: -nativeDistance,
                    duration: scrollDuration,
                    useNativeDriver: true,
                }),
                Animated.delay(1500),
                Animated.timing(scrollAnim, {
                    toValue: 0,
                    duration: scrollDuration,
                    useNativeDriver: true,
                }),
                Animated.delay(1000),
            ])
        );

        animation.start();
        return () => animation.stop();
    }, [nativeDistance, text]);

    if (Platform.OS === "web") {
        // Flatten RN style to plain CSS
        const flatStyle = StyleSheet.flatten(style) || {};
        const cssStyle: React.CSSProperties = {
            color: flatStyle.color,
            fontSize: flatStyle.fontSize,
            fontFamily: flatStyle.fontFamily,
            fontWeight: flatStyle.fontWeight,
            textAlign: flatStyle.textAlign,
            whiteSpace: "nowrap",
            overflow: shouldScroll ? "visible" : "hidden",
            display: shouldScroll ? "inline-block" : "block",
            ...(shouldScroll
                ? {
                    animation: `marquee-scroll ${animDuration}s linear infinite`,
                    animationDelay: "1.5s",
                }
                : { textOverflow: "ellipsis" }),
        };

        return (
            <div ref={containerRef} style={{ overflow: "hidden", width: "100%" }}>
                <style>{`
                    @keyframes marquee-scroll {
                        0%, 15% { transform: translateX(0); }
                        45%, 60% { transform: translateX(calc(-100% + ${containerRef.current?.offsetWidth || 200}px)); }
                        75%, 100% { transform: translateX(0); }
                    }
                `}</style>
                <span ref={textRef} style={cssStyle}>
                    {text}
                </span>
            </div>
        );
    }

    // Native (iOS/Android)
    const flattenedStyle = StyleSheet.flatten(style) || {};
    const { width: _w, ...measureStyle } = flattenedStyle;

    return (
        <View
            style={{ overflow: "hidden", width: "100%" }}
            onLayout={(e) => setNativeContainerWidth(e.nativeEvent.layout.width)}
        >
            {/* Hidden text in wide parent to measure actual text width */}
            <View style={{ position: "absolute", opacity: 0, width: 99999, alignItems: "flex-start" }}>
                <Text
                    style={measureStyle}
                    numberOfLines={1}
                    onLayout={(e) => setNativeTextWidth(e.nativeEvent.layout.width)}
                >
                    {text}
                </Text>
            </View>
            <Animated.View style={{ transform: [{ translateX: scrollAnim }] }}>
                <Text numberOfLines={1} style={[style, nativeDistance > 0 ? { width: nativeTextWidth } : {}]}>
                    {text}
                </Text>
            </Animated.View>
        </View>
    );
}

function formatMs(ms: number) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function AnimatedVoteCounter({ votes, style }: { votes: number; style: any }) {
    const prevVotes = useRef(votes);
    const animValue = useRef(new Animated.Value(0)).current;
    const popScale = useRef(new Animated.Value(1)).current;
    const [displayVotes, setDisplayVotes] = useState(votes);

    useEffect(() => {
        if (votes !== prevVotes.current) {
            const direction = votes > prevVotes.current ? 1 : -1;
            animValue.setValue(direction * 28);
            setDisplayVotes(votes);
            Animated.spring(animValue, {
                toValue: 0,
                friction: 8,
                tension: 100,
                useNativeDriver: true,
            }).start();

            if (direction > 0) {
                popScale.setValue(1);
                Animated.sequence([
                    Animated.spring(popScale, {
                        toValue: 1.34,
                        useNativeDriver: true,
                        speed: 26,
                        bounciness: 12,
                    }),
                    Animated.spring(popScale, {
                        toValue: 1,
                        useNativeDriver: true,
                        speed: 22,
                        bounciness: 10,
                    }),
                ]).start();
            }

            prevVotes.current = votes;
        }
    }, [votes, animValue, popScale]);

    return (
        <View style={[style, { overflow: "hidden" }]}>
            <Animated.Text
                style={[
                    { fontSize: (StyleSheet.flatten(style) as any)?.fontSize || 14, color: (StyleSheet.flatten(style) as any)?.color || "#fff", textAlign: "center" },
                    { transform: [{ translateY: animValue }, { scale: popScale }] },
                ]}
            >
                {displayVotes === 1 ? "1 vote" : `${displayVotes} votes`}
            </Animated.Text>
        </View>
    );
}

function AnimatedVoteButton({ onPress, style }: { onPress: () => void; style: any }) {
    const scale = useRef(new Animated.Value(1)).current;
    const showGlassPreview = Platform.OS === "ios" || Platform.OS === "web";

    const handlePressIn = () => {
        Animated.spring(scale, {
            toValue: 0.82,
            useNativeDriver: true,
            speed: 50,
            bounciness: 4,
        }).start();
    };

    const handlePressOut = () => {
        Animated.spring(scale, {
            toValue: 1,
            useNativeDriver: true,
            speed: 20,
            bounciness: 14,
        }).start();
    };

    return (
        <Animated.View style={[style, { transform: [{ scale }] }]}>
            <Pressable
                onPress={onPress}
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                style={[
                    { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' },
                    showGlassPreview && styles.playlistVoteButtonGlass,
                ]}
            >
                {showGlassPreview && <View pointerEvents="none" style={styles.playlistVoteButtonGlassGlow} />}
                {showGlassPreview && <View pointerEvents="none" style={styles.playlistVoteButtonGlassHighlight} />}
                <Image source={require('../../assets/images/votebutton.png')} style={styles.playlistVoteButtonImage} resizeMode='contain' />
            </Pressable>
        </Animated.View>
    );
}

export default function App() {
    const [fontsLoaded] = useFonts({
        Anton: require("../../assets/fonts/Anton-Regular.ttf"),
    });
    const [accessState, setAccessState] = useState<AccessState>("voting");
    const [hasAccess, setHasAccess] = useState(false);
    const [memberNumber, setMemberNumber] = useState("");
    const [permission, requestPermission] = useCameraPermissions();
    const [playlists, setPlaylists] = useState<Playlist[]>(clonePlaylists());
    const [currentPlaylistUri, setCurrentPlaylistUri] = useState<string | null>(null);
    const [pendingPlaylistUri, setPendingPlaylistUri] = useState<string | null>(null);
    const [spotifySession, setSpotifySession] = useState<SpotifySession | null>(null);
    const [spotifyStatus, setSpotifyStatus] = useState("Connect Spotify to enable playback.");
    const [currentTrackArtUrl, setCurrentTrackArtUrl] = useState<string | null>(null);
    const [currentTrackName, setCurrentTrackName] = useState("");
    const [currentTrackArtist, setCurrentTrackArtist] = useState("");
    const [nextTrackName, setNextTrackName] = useState("");
    const [nextTrackArtist, setNextTrackArtist] = useState("");
    const [trackProgressMs, setTrackProgressMs] = useState(0);
    const [trackDurationMs, setTrackDurationMs] = useState(0);
    const [showReconnectButton, setShowReconnectButton] = useState(false);
    const [memberCooldownCountdown, setMemberCooldownCountdown] = useState("0:00");
    const [volumePercent, setVolumePercent] = useState(10);
    const [volumeWindow, setVolumeWindow] = useState(false);
    const [volumeCountdown, setVolumeCountdown] = useState(0);
    const volumeWindowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const volumeCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const scanDismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const idleAttractTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [voteHistory, setVoteHistory] = useState<VoteHistoryEntry[]>([]);
    const [memberRecords, setMemberRecords] = useState<Record<string, MemberRecord>>({});
    const memberRecordsRef = useRef<Record<string, MemberRecord>>({});
    const [activeMemberId, setActiveMemberId] = useState<string | null>(null);
    const [rejectedMemberId, setRejectedMemberId] = useState<string | null>(null);

    const cameraRef = useRef<CameraView>(null);
    const lastValidIdRef = useRef("");
    const scanIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const membersLoadedRef = useRef(false);

    const memberCount = Object.keys(memberRecords).length;
    const selectedMemberRecord = activeMemberId ? memberRecords[activeMemberId] : null;

    // Load member records and vote history from storage on mount
    useEffect(() => {
        (async () => {
            try {
                const stored = await AsyncStorage.getItem(SCANNED_IDS_KEY);
                if (stored) {
                    const parsed = JSON.parse(stored) as Record<string, MemberRecord>;
                    // Filter out expired members (>1hr)
                    const now = Date.now();
                    const valid: Record<string, MemberRecord> = {};
                    for (const [id, record] of Object.entries(parsed)) {
                        if (now - record.scannedAt < MEMBER_COOLDOWN_MS) {
                            valid[id] = record;
                        }
                    }
                    memberRecordsRef.current = valid;
                    setMemberRecords(valid);
                }
                const historyStored = await AsyncStorage.getItem(VOTE_HISTORY_KEY);
                if (historyStored) {
                    setVoteHistory(JSON.parse(historyStored));
                }
            } catch { }
            membersLoadedRef.current = true;
        })();
    }, []);

    // Persist vote history whenever it changes
    useEffect(() => {
        if (voteHistory.length > 0) {
            AsyncStorage.setItem(VOTE_HISTORY_KEY, JSON.stringify(voteHistory));
        }
    }, [voteHistory]);

    const overlayOpacity = useRef(new Animated.Value(0)).current;
    const topWinnerGlowAnim = useRef(new Animated.Value(0.55)).current;
    const progressFillAnim = useRef(new Animated.Value(0)).current;
    const progressShimmerAnim = useRef(new Animated.Value(0)).current;
    const idleOverlayOpacity = useRef(new Animated.Value(0)).current;
    const idleGlowPulse = useRef(new Animated.Value(0)).current;
    const lightSweepTranslateX = useRef(new Animated.Value(-760)).current;
    const volumeGlowOpacity = useRef(new Animated.Value(0)).current;
    const volumeGlowScale = useRef(new Animated.Value(0.88)).current;
    const [isIdleAttractActive, setIsIdleAttractActive] = useState(false);
    const idleRippleAnimsRef = useRef<Animated.Value[]>([]);
    if (idleRippleAnimsRef.current.length !== 6) {
        idleRippleAnimsRef.current = Array.from({ length: 6 }, () => new Animated.Value(0));
    }
    const idleRippleAnims = idleRippleAnimsRef.current;
    const isRecoveringSpotifyRef = useRef(false);
    const songsRemainingRef = useRef(0);
    const lastTrackedSongUriRef = useRef<string | null>(null);
    const lastTrackProgressMsRef = useRef<number | null>(null);
    const lastTrackDurationMsRef = useRef<number | null>(null);
    const isSwitchingPlaylistRef = useRef(false);
    const waveBarsRef = useRef<Animated.Value[]>([]);
    if (waveBarsRef.current.length !== WAVE_BAR_COUNT) {
        waveBarsRef.current = Array.from(
            { length: WAVE_BAR_COUNT },
            (_, index) => new Animated.Value(0.5 + ((index * 13) % 45) / 100)
        );
    }
    const waveBars = waveBarsRef.current;

    // Album art crossfade
    const artFadeAnim = useRef(new Animated.Value(1)).current;
    const [prevTrackArtUrl, setPrevTrackArtUrl] = useState<string | null>(null);
    const lastArtUrlRef = useRef<string | null>(null);

    useEffect(() => {
        if (currentTrackArtUrl !== lastArtUrlRef.current) {
            if (lastArtUrlRef.current !== null) {
                setPrevTrackArtUrl(lastArtUrlRef.current);
                artFadeAnim.setValue(0);
                Animated.timing(artFadeAnim, {
                    toValue: 1,
                    duration: 600,
                    useNativeDriver: true,
                }).start(() => {
                    setPrevTrackArtUrl(null);
                });
            }
            lastArtUrlRef.current = currentTrackArtUrl;
        }
    }, [currentTrackArtUrl, artFadeAnim]);

    const showReconnectTemporarily = () => {
        setShowReconnectButton(true);
    };

    const triggerVolumeGlow = () => {
        volumeGlowOpacity.setValue(0.3);
        volumeGlowScale.setValue(0.88);
        Animated.parallel([
            Animated.timing(volumeGlowOpacity, {
                toValue: 0,
                duration: 650,
                easing: Easing.out(Easing.quad),
                useNativeDriver: true,
            }),
            Animated.timing(volumeGlowScale, {
                toValue: 1.22,
                duration: 650,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
            }),
        ]).start();
    };

    const TEST_ID = "4006977";
    const isWebPreviewMode = Platform.OS === "web" && !spotifySession;

    const extractMemberId = (text: string) => {
        if (text.includes(TEST_ID)) {
            return TEST_ID;
        }

        const lower = text.toLowerCase();
        if (!lower.includes("gym")) {
            return null;
        }

        const matches = text.match(/\d{7}/g);
        if (!matches) {
            return null;
        }

        return matches[0];
    };

    const saveSpotifySession = async (session: SpotifySession | null) => {
        if (!session) {
            await AsyncStorage.removeItem(SPOTIFY_STORAGE_KEY);
            return;
        }

        await AsyncStorage.setItem(SPOTIFY_STORAGE_KEY, JSON.stringify(session));
    };

    const getValidSpotifyAccessToken = async () => {
        if (!spotifySession) {
            return null;
        }

        if (Date.now() < spotifySession.expiresAt - 60_000) {
            return spotifySession.accessToken;
        }

        if (spotifySession.refreshToken) {
            try {
                setSpotifyStatus("Refreshing Spotify session...");
                const body = new URLSearchParams();
                body.set("grant_type", "refresh_token");
                body.set("refresh_token", spotifySession.refreshToken);
                body.set("client_id", SPOTIFY_CLIENT_ID);

                const response = await fetch(SPOTIFY_TOKEN_ENDPOINT, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/x-www-form-urlencoded",
                    },
                    body: body.toString(),
                });

                if (response.ok) {
                    const data = await response.json() as {
                        access_token: string;
                        refresh_token?: string;
                        expires_in: number;
                    };

                    const refreshedSession: SpotifySession = {
                        accessToken: data.access_token,
                        refreshToken: data.refresh_token ?? spotifySession.refreshToken,
                        expiresAt: Date.now() + data.expires_in * 1000,
                    };

                    setSpotifySession(refreshedSession);
                    await saveSpotifySession(refreshedSession);
                    setSpotifyStatus("Spotify connected. You can start voting now.");
                    return refreshedSession.accessToken;
                }
            } catch (error) {
                console.error("Spotify refresh failed:", error);
            }
        }

        setSpotifySession(null);
        await saveSpotifySession(null);
        setSpotifyStatus("Spotify session expired. Connect again.");
        return null;
    };

    const playPlaylist = async (playlistUri: string, hasRetried = false): Promise<boolean> => {
        const accessToken = await getValidSpotifyAccessToken();

        if (!accessToken) {
            if (!hasRetried && !isRecoveringSpotifyRef.current) {
                isRecoveringSpotifyRef.current = true;
                const reconnected = await handleSpotifyConnect(true);
                isRecoveringSpotifyRef.current = false;

                if (reconnected) {
                    return playPlaylist(playlistUri, true);
                }
            }

            showReconnectTemporarily();
            setSpotifyStatus("Connect Spotify before voting playback can start.");
            return false;
        }

        // Fetch available devices and activate one if none is active.
        const devicesResponse = await fetch("https://api.spotify.com/v1/me/player/devices", {
            headers: { Authorization: `Bearer ${accessToken}` },
        });

        let deviceId: string | null = null;

        if (devicesResponse.ok) {
            const devicesData = await devicesResponse.json() as {
                devices: { id: string; is_active: boolean; name: string }[];
            };

            const activeDevice = devicesData.devices.find((d) => d.is_active);
            const anyDevice = devicesData.devices[0] ?? null;

            if (activeDevice) {
                deviceId = activeDevice.id;
            } else if (anyDevice) {
                // Transfer playback to the first available device.
                deviceId = anyDevice.id;
                await fetch("https://api.spotify.com/v1/me/player", {
                    method: "PUT",
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ device_ids: [anyDevice.id], play: false }),
                });
                // Give Spotify a moment to register the transfer.
                await new Promise((resolve) => setTimeout(resolve, 800));
            } else {
                setSpotifyStatus("No Spotify device found. Open Spotify on a device first, then vote.");
                return false;
            }
        } else if ((devicesResponse.status === 401 || devicesResponse.status === 403) && !hasRetried && !isRecoveringSpotifyRef.current) {
            isRecoveringSpotifyRef.current = true;
            const reconnected = await handleSpotifyConnect(true);
            isRecoveringSpotifyRef.current = false;

            if (reconnected) {
                return playPlaylist(playlistUri, true);
            }

            showReconnectTemporarily();
        }

        await fetch(
            `https://api.spotify.com/v1/me/player/shuffle?state=true${deviceId ? `&device_id=${deviceId}` : ""}`,
            {
                method: "PUT",
                headers: { Authorization: `Bearer ${accessToken}` },
            }
        );

        const playBody: Record<string, unknown> = { context_uri: playlistUri };

        const response = await fetch("https://api.spotify.com/v1/me/player/play", {
            method: "PUT",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(playBody),
        });

        if (!response.ok) {
            if ((response.status === 401 || response.status === 403) && !hasRetried && !isRecoveringSpotifyRef.current) {
                isRecoveringSpotifyRef.current = true;
                const reconnected = await handleSpotifyConnect(true);
                isRecoveringSpotifyRef.current = false;

                if (reconnected) {
                    return playPlaylist(playlistUri, true);
                }

                showReconnectTemporarily();
            }

            const errorText = await response.text();
            setSpotifyStatus(errorText || "Spotify playback failed. Open Spotify on a device first.");
            return false;
        }

        setSpotifyStatus("Spotify connected. Votes can now change the music.");
        return true;
    };

    const captureAndRecognizeText = async () => {
        if (!cameraRef.current || accessState !== "scanning") {
            return;
        }

        try {
            const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });

            if (!photo?.uri) {
                return;
            }

            const result = await TextRecognition.recognize(photo.uri);
            const foundId = result.text ? extractMemberId(result.text) : null;

            if (foundId && foundId !== lastValidIdRef.current) {
                lastValidIdRef.current = foundId;
                handleCheckIn(foundId);
            }
        } catch (error) {
            console.error("Text recognition error:", error);
        }
    };

    const saveMemberRecords = (records: Record<string, MemberRecord>) => {
        memberRecordsRef.current = records;
        setMemberRecords({ ...records });
        AsyncStorage.setItem(SCANNED_IDS_KEY, JSON.stringify(records));
    };

    const handleCheckIn = (id: string) => {
        const trimmed = id.trim();
        if (!trimmed || !membersLoadedRef.current) {
            return;
        }

        const now = Date.now();
        const existing = memberRecordsRef.current[trimmed];

        if (trimmed !== TEST_ID && existing) {
            const elapsed = now - existing.scannedAt;

            // Cooldown expired — treat as fresh
            if (elapsed >= MEMBER_COOLDOWN_MS) {
                // Fall through to fresh scan below
            } else if (elapsed < RETURN_WINDOW_MS) {
                // Within 30s return window — allow what they haven't done
                const canGenre = !existing.votedGenre;
                const canVolume = !existing.votedVolume;

                if (!canGenre && !canVolume) {
                    // Already did both — reject
                    setRejectedMemberId(trimmed);
                    setAccessState("invalid");
                    if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
                    setTimeout(() => { setAccessState("voting"); setMemberNumber(""); lastValidIdRef.current = ""; }, 5000);
                    return;
                }

                setActiveMemberId(trimmed);
                setAccessState("voting");
                if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);

                if (canGenre && !canVolume) {
                    // They voted volume already, now can vote genre
                    setHasAccess(true);
                    setVolumeWindow(false);
                } else if (!canGenre && canVolume) {
                    // They voted genre already, now can vote volume
                    setHasAccess(false);
                    setVolumeWindow(true);
                    setVolumeCountdown(10);
                    if (volumeCountdownRef.current) clearInterval(volumeCountdownRef.current);
                    volumeCountdownRef.current = setInterval(() => {
                        setVolumeCountdown((prev) => {
                            if (prev <= 1) { if (volumeCountdownRef.current) clearInterval(volumeCountdownRef.current); return 0; }
                            return prev - 1;
                        });
                    }, 1000);
                    if (volumeWindowTimerRef.current) clearTimeout(volumeWindowTimerRef.current);
                    volumeWindowTimerRef.current = setTimeout(() => {
                        setVolumeWindow(false);
                        setAccessState("scanning");
                        if (volumeCountdownRef.current) clearInterval(volumeCountdownRef.current);
                    }, 10000);
                } else {
                    // Can do both
                    setHasAccess(true);
                    setVolumeWindow(false);
                }

                setTimeout(() => { setMemberNumber(""); lastValidIdRef.current = ""; }, 600);
                return;
            } else {
                // Between 30s and 1hr — fully locked out
                setRejectedMemberId(trimmed);
                setAccessState("invalid");
                if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
                setTimeout(() => { setAccessState("voting"); setMemberNumber(""); lastValidIdRef.current = ""; }, 5000);
                return;
            }
        }

        // Fresh scan (new member or cooldown expired)
        const record: MemberRecord = { scannedAt: now, votedGenre: false, votedVolume: null };
        if (trimmed !== TEST_ID) {
            const updated = { ...memberRecordsRef.current, [trimmed]: record };
            saveMemberRecords(updated);
        }
        setActiveMemberId(trimmed);
        setHasAccess(true);
        setVolumeWindow(true);
        setAccessState("voting");
        if (scanDismissTimerRef.current) clearTimeout(scanDismissTimerRef.current);

        // Auto-lock after 10s of inactivity
        if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = setTimeout(() => {
            setHasAccess(false);
            setVolumeWindow(false);
            setActiveMemberId(null);
            setVolumeCountdown(0);
        }, 10000);

        if (scanIntervalRef.current) {
            clearInterval(scanIntervalRef.current);
        }

        setTimeout(() => {
            setMemberNumber("");
            lastValidIdRef.current = "";
        }, 600);
    };

    const applyVote = async (playlistId: number) => {
        const nextPlaylists = playlists.map((playlist) =>
            playlist.id === playlistId
                ? { ...playlist, votes: playlist.votes + 1 }
                : playlist
        );

        LayoutAnimation.configureNext({
            duration: 800,
            update: {
                type: LayoutAnimation.Types.spring,
                springDamping: 0.85,
                property: LayoutAnimation.Properties.scaleXY,
            },
        });
        setPlaylists(nextPlaylists);

        const winner = getWinningPlaylist(nextPlaylists);

        if (!currentPlaylistUri) {
            const accessToken = await getValidSpotifyAccessToken();

            if (accessToken) {
                try {
                    const response = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
                        headers: {
                            Authorization: `Bearer ${accessToken}`,
                        },
                    });

                    if (response.ok && response.status !== 204) {
                        const text = await response.text();
                        if (text) {
                            const data = JSON.parse(text) as {
                                context?: { uri?: string; type?: string };
                                item?: { uri?: string };
                            };

                            // If staff has already started music (from laptop/other device),
                            // adopt that as current context and delay switching to the voted winner.
                            const contextUri = data.context?.uri;
                            const detectedCurrentUri =
                                contextUri && contextUri.startsWith("spotify:playlist:")
                                    ? contextUri
                                    : data.item?.uri
                                        ? "spotify:context:external"
                                        : null;

                            if (detectedCurrentUri) {
                                setCurrentPlaylistUri(detectedCurrentUri);

                                if (detectedCurrentUri !== winner.uri) {
                                    songsRemainingRef.current = SONGS_BEFORE_GENRE_SWITCH;
                                    setPendingPlaylistUri(winner.uri);
                                    setSpotifyStatus(`${winner.name} is now winning — switching after this song and the next song.`);
                                }
                                return;
                            }
                        }
                    }
                } catch {
                    // Fall through to normal startup path.
                }
            }

            const didPlay = await playPlaylist(winner.uri);
            if (didPlay) {
                setCurrentPlaylistUri(winner.uri);
            }
            return;
        }

        if (currentPlaylistUri !== winner.uri) {
            if (!pendingPlaylistUri || pendingPlaylistUri !== winner.uri) {
                songsRemainingRef.current = SONGS_BEFORE_GENRE_SWITCH;
            }
            setPendingPlaylistUri(winner.uri);
            setSpotifyStatus(`${winner.name} is now winning — switching after this song and the next song.`);
        }
    };

    const handleVote = async (playlistId: number) => {
        if (!hasAccess) {
            setAccessState("scanning");
            // Auto-dismiss scan popup after 30s with fade out
            if (scanDismissTimerRef.current) clearTimeout(scanDismissTimerRef.current);
            scanDismissTimerRef.current = setTimeout(() => {
                Animated.timing(overlayOpacity, {
                    toValue: 0,
                    duration: 400,
                    useNativeDriver: true,
                }).start(() => {
                    setAccessState("voting");
                });
            }, 30000);
            return;
        }

        await applyVote(playlistId);
        setHasAccess(false);
        if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);

        // Record genre vote for this member
        if (activeMemberId && activeMemberId !== TEST_ID) {
            const records = { ...memberRecordsRef.current };
            if (records[activeMemberId]) {
                records[activeMemberId] = { ...records[activeMemberId], votedGenre: true };
                saveMemberRecords(records);
            }
        }

        // Check if they already voted volume — if so, stay on voting view (both done)
        const memberRec = activeMemberId ? memberRecordsRef.current[activeMemberId] : null;
        if (memberRec?.votedVolume) {
            setVolumeWindow(false);
            setActiveMemberId(null);
            if (volumeWindowTimerRef.current) clearTimeout(volumeWindowTimerRef.current);
            if (volumeCountdownRef.current) clearInterval(volumeCountdownRef.current);
            setVolumeCountdown(0);
            return;
        }

        // Otherwise keep volume window open with 7s countdown
        setVolumeWindow(true);
        setVolumeCountdown(7);

        if (volumeCountdownRef.current) clearInterval(volumeCountdownRef.current);
        volumeCountdownRef.current = setInterval(() => {
            setVolumeCountdown((prev) => {
                if (prev <= 1) {
                    if (volumeCountdownRef.current) clearInterval(volumeCountdownRef.current);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        if (volumeWindowTimerRef.current) clearTimeout(volumeWindowTimerRef.current);
        volumeWindowTimerRef.current = setTimeout(() => {
            setVolumeWindow(false);
            setActiveMemberId(null);
            if (volumeCountdownRef.current) clearInterval(volumeCountdownRef.current);
            setVolumeCountdown(0);
        }, 5000);
    };

    const handleSpotifyConnect = async (isAutoRecovery = false): Promise<boolean> => {
        try {
            setSpotifyStatus(isAutoRecovery ? "Reconnecting Spotify..." : "Opening Spotify login...");
            const state = randomState();
            const pkce = await createPkcePair();
            const authUrl = new URL(SPOTIFY_AUTHORIZE_ENDPOINT);
            authUrl.searchParams.set("client_id", SPOTIFY_CLIENT_ID);
            authUrl.searchParams.set("response_type", "code");
            authUrl.searchParams.set("redirect_uri", SPOTIFY_WEB_REDIRECT_URI);
            authUrl.searchParams.set("scope", SPOTIFY_SCOPES.join(" "));
            authUrl.searchParams.set("state", state);
            authUrl.searchParams.set("code_challenge_method", pkce.method);
            authUrl.searchParams.set("code_challenge", pkce.challenge);
            const authResult = await WebBrowser.openAuthSessionAsync(
                authUrl.toString(),
                SPOTIFY_APP_RETURN_URI
            );

            if (authResult.type !== "success") {
                setSpotifyStatus("Spotify login cancelled.");
                return false;
            }

            const params = parseUrlParams(authResult.url);
            const error = params.get("error");
            const authCode = params.get("code");
            const returnedState = params.get("state");

            if (error) {
                setSpotifyStatus(`Spotify auth failed: ${error}`);
                return false;
            }

            if (!authCode) {
                setSpotifyStatus("Spotify auth failed. No authorization code returned.");
                return false;
            }

            if (!returnedState || returnedState !== state) {
                setSpotifyStatus("Spotify auth failed. State mismatch.");
                return false;
            }

            const tokenBody = new URLSearchParams();
            tokenBody.set("grant_type", "authorization_code");
            tokenBody.set("code", authCode);
            tokenBody.set("redirect_uri", SPOTIFY_WEB_REDIRECT_URI);
            tokenBody.set("client_id", SPOTIFY_CLIENT_ID);
            tokenBody.set("code_verifier", pkce.verifier);

            const tokenResponse = await fetch(SPOTIFY_TOKEN_ENDPOINT, {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                body: tokenBody.toString(),
            });

            if (!tokenResponse.ok) {
                const errorText = await tokenResponse.text();
                setSpotifyStatus(`Spotify token exchange failed: ${errorText || tokenResponse.status}`);
                return false;
            }

            const tokenData = await tokenResponse.json() as {
                access_token: string;
                refresh_token?: string;
                expires_in: number;
            };

            const nextSession: SpotifySession = {
                accessToken: tokenData.access_token,
                refreshToken: tokenData.refresh_token ?? null,
                expiresAt: Date.now() + tokenData.expires_in * 1000,
            };

            setSpotifySession(nextSession);
            await saveSpotifySession(nextSession);
            setSpotifyStatus("Spotify connected. You can start voting now.");
            return true;
        } catch (error) {
            console.error("Spotify auth failed:", error);
            setSpotifyStatus("Spotify auth failed. Check callback URL and Spotify app settings.");
            return false;
        }
    };

    useEffect(() => {
        AsyncStorage.getItem(SPOTIFY_STORAGE_KEY)
            .then((value) => {
                if (!value) {
                    return;
                }

                const parsed = JSON.parse(value) as SpotifySession;
                setSpotifySession(parsed);
                setSpotifyStatus("Spotify session restored.");
            })
            .catch((error) => {
                console.error("Failed to restore Spotify session:", error);
            });
    }, []);

    // Countdown timer for selected member cooldown
    useEffect(() => {
        const tick = setInterval(() => {
            const selected = activeMemberId ? memberRecordsRef.current[activeMemberId] : null;
            const remaining = selected
                ? Math.max(0, selected.scannedAt + MEMBER_COOLDOWN_MS - Date.now())
                : 0;
            const mins = Math.floor(remaining / 60000);
            const secs = Math.floor((remaining % 60000) / 1000);
            setMemberCooldownCountdown(`${mins}:${secs.toString().padStart(2, "0")}`);
        }, 1000);

        return () => clearInterval(tick);
    }, [activeMemberId]);

    useEffect(() => {
        if (accessState !== "scanning" || !permission?.granted) {
            return;
        }

        scanIntervalRef.current = setInterval(() => {
            captureAndRecognizeText();
        }, 1000);

        return () => {
            if (scanIntervalRef.current) {
                clearInterval(scanIntervalRef.current);
            }
        };
    }, [accessState, permission?.granted]);

    useEffect(() => {
        if (!pendingPlaylistUri) {
            return;
        }

        const checkPendingSwitch = async () => {
            const accessToken = await getValidSpotifyAccessToken();
            if (!accessToken) {
                return;
            }

            const response = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            });

            if (!response.ok || response.status === 204) {
                return;
            }

            const text = await response.text();
            if (!text) {
                return;
            }

            const data = JSON.parse(text);
            const currentSongUri = data.item?.uri ?? null;
            const progress = data.progress_ms;
            const duration = data.item?.duration_ms;
            const hasValidProgress = typeof progress === "number";
            const hasValidDuration = typeof duration === "number" && duration > 0;

            const songChangedByUri =
                !!currentSongUri &&
                !!lastTrackedSongUriRef.current &&
                currentSongUri !== lastTrackedSongUriRef.current;
            const songRestarted =
                hasValidProgress &&
                lastTrackProgressMsRef.current !== null &&
                progress + 5000 < lastTrackProgressMsRef.current;

            const previousProgress = lastTrackProgressMsRef.current;
            const previousDuration = lastTrackDurationMsRef.current;
            const previousTrackLikelyFinished =
                typeof previousProgress === "number" &&
                (typeof previousDuration === "number" && previousDuration > 0
                    ? previousDuration - previousProgress <= CROSSFADE_SAFE_COMPLETION_WINDOW_MS ||
                    previousProgress / previousDuration >= MIN_COMPLETION_RATIO
                    : previousProgress >= MIN_PLAYED_WITHOUT_DURATION_MS);

            // Count only true song completions so crossfade and manual skips do not cause early switches.
            if ((songChangedByUri || songRestarted) && previousTrackLikelyFinished && songsRemainingRef.current > 0) {
                songsRemainingRef.current = Math.max(0, songsRemainingRef.current - 1);
            }

            if (currentSongUri) {
                lastTrackedSongUriRef.current = currentSongUri;
            }
            if (hasValidProgress) {
                lastTrackProgressMsRef.current = progress;
            }
            if (hasValidDuration) {
                lastTrackDurationMsRef.current = duration;
            }

            const timeRemainingMs =
                hasValidProgress && hasValidDuration ? Math.max(0, duration - progress) : null;
            const shouldPreemptiveSwitch =
                songsRemainingRef.current === 1 &&
                typeof timeRemainingMs === "number" &&
                timeRemainingMs <= SPOTIFY_CROSSFADE_MS + PRE_SWITCH_BUFFER_MS;
            const shouldSwitchAfterCountdown = songsRemainingRef.current <= 0;

            // Pre-switch before crossfade starts on the final allowed song, or switch once countdown is complete.
            if (
                (shouldPreemptiveSwitch || shouldSwitchAfterCountdown) &&
                pendingPlaylistUri &&
                !isSwitchingPlaylistRef.current
            ) {
                isSwitchingPlaylistRef.current = true;
                const didPlay = await playPlaylist(pendingPlaylistUri);
                if (didPlay) {
                    setCurrentPlaylistUri(pendingPlaylistUri);
                    setPendingPlaylistUri(null);
                    songsRemainingRef.current = 0;
                    lastTrackedSongUriRef.current = null;
                    lastTrackProgressMsRef.current = null;
                    lastTrackDurationMsRef.current = null;
                }
                isSwitchingPlaylistRef.current = false;
            }
        };

        // Run immediately so we don't miss the first track transition window.
        void checkPendingSwitch();

        const interval = setInterval(() => {
            void checkPendingSwitch();
        }, 3000);

        return () => clearInterval(interval);
    }, [pendingPlaylistUri, spotifySession]);

    useEffect(() => {
        if (accessState !== "voting") {
            return;
        }

        let isActive = true;

        const refreshCurrentTrackArtwork = async () => {
            const accessToken = await getValidSpotifyAccessToken();
            if (!accessToken) {
                if (isActive) {
                    setCurrentTrackArtUrl(null);
                    setCurrentTrackName("");
                    setCurrentTrackArtist("");
                }
                return;
            }

            const response = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            });

            if (!response.ok || response.status === 204) {
                if (isActive) {
                    setCurrentTrackArtUrl(null);
                    setCurrentTrackName("");
                    setCurrentTrackArtist("");
                }
                return;
            }

            const text = await response.text();
            if (!text) {
                if (isActive) {
                    setCurrentTrackArtUrl(null);
                    setCurrentTrackName("");
                    setCurrentTrackArtist("");
                }
                return;
            }

            const data = JSON.parse(text) as {
                item?: {
                    name?: string;
                    artists?: { name: string }[];
                    album?: {
                        images?: { url: string }[];
                    };
                    duration_ms?: number;
                };
                progress_ms?: number;
            };

            const artUrl = data.item?.album?.images?.[0]?.url ?? null;
            const trackName = data.item?.name ?? "";
            const trackArtist = data.item?.artists?.map((artist) => artist.name).join(", ") ?? "";
            if (isActive) {
                setCurrentTrackArtUrl(artUrl);
                setCurrentTrackName(trackName);
                setCurrentTrackArtist(trackArtist);
                setTrackProgressMs(data.progress_ms ?? 0);
                setTrackDurationMs(data.item?.duration_ms ?? 0);
            }

            // Fetch next track from queue
            try {
                const queueResponse = await fetch("https://api.spotify.com/v1/me/player/queue", {
                    headers: { Authorization: `Bearer ${accessToken}` },
                });
                if (queueResponse.ok) {
                    const queueData = await queueResponse.json() as { queue?: { name?: string; artists?: { name: string }[] }[] };
                    const next = queueData.queue?.[0]?.name ?? "";
                    const nextArtist = queueData.queue?.[0]?.artists?.map((a) => a.name).join(", ") ?? "";
                    if (isActive) {
                        setNextTrackName(next);
                        setNextTrackArtist(nextArtist);
                    }
                } else if (isActive) {
                    setNextTrackName("");
                    setNextTrackArtist("");
                }
            } catch {
                if (isActive) {
                    setNextTrackName("");
                    setNextTrackArtist("");
                }
            }

            // Sync volume from Spotify player state
            try {
                const playerResponse = await fetch("https://api.spotify.com/v1/me/player", {
                    headers: { Authorization: `Bearer ${accessToken}` },
                });
                if (playerResponse.ok) {
                    const playerData = await playerResponse.json() as { device?: { volume_percent?: number } };
                    const vol = playerData.device?.volume_percent;
                    if (vol != null && isActive) {
                        setVolumePercent(Math.round(vol / 5));
                    }
                }
            } catch { }
        };

        void refreshCurrentTrackArtwork();
        const interval = setInterval(() => {
            void refreshCurrentTrackArtwork();
        }, 5000);

        return () => {
            isActive = false;
            clearInterval(interval);
        };
    }, [accessState, spotifySession]);

    useEffect(() => {
        if (!isWebPreviewMode || accessState !== "voting") {
            return;
        }

        setCurrentTrackName(WEB_PREVIEW_TRACK.name);
        setCurrentTrackArtist(WEB_PREVIEW_TRACK.artist);
        setNextTrackName(WEB_PREVIEW_TRACK.nextName);
        setNextTrackArtist(WEB_PREVIEW_TRACK.nextArtist);
        setTrackDurationMs(WEB_PREVIEW_TRACK.durationMs);
        setTrackProgressMs(WEB_PREVIEW_TRACK.startProgressMs);
        setSpotifyStatus("Local preview mode.");
    }, [accessState, isWebPreviewMode]);

    useEffect(() => {
        if (trackDurationMs <= 0) return;

        const tick = setInterval(() => {
            setTrackProgressMs((prev) => {
                const next = prev + 1000;
                if (isWebPreviewMode) {
                    return next >= trackDurationMs ? 0 : next;
                }
                return next > trackDurationMs ? trackDurationMs : next;
            });
        }, 1000);

        return () => clearInterval(tick);
    }, [isWebPreviewMode, trackDurationMs, currentTrackName]);

    useEffect(() => {
        const targetRatio = trackDurationMs > 0 ? Math.min(trackProgressMs / trackDurationMs, 1) : 0;

        Animated.timing(progressFillAnim, {
            toValue: targetRatio,
            duration: 320,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
        }).start();
    }, [trackProgressMs, trackDurationMs, progressFillAnim]);

    useEffect(() => {
        progressShimmerAnim.setValue(0);
        const anim = Animated.loop(
            Animated.sequence([
                Animated.timing(progressShimmerAnim, {
                    toValue: 1,
                    duration: 2200,
                    easing: Easing.linear,
                    useNativeDriver: true,
                }),
                Animated.timing(progressShimmerAnim, {
                    toValue: 0,
                    duration: 0,
                    useNativeDriver: true,
                }),
            ])
        );
        anim.start();
        return () => anim.stop();
    }, [progressShimmerAnim]);

    useEffect(() => {
        const isOverlayVisible = accessState === "scanning" || accessState === "manual" || accessState === "invalid";
        if (!isOverlayVisible) {
            overlayOpacity.setValue(0);
            return;
        }

        overlayOpacity.setValue(0);
        Animated.timing(overlayOpacity, {
            toValue: 1,
            duration: 220,
            useNativeDriver: true,
        }).start();
    }, [accessState, overlayOpacity]);

    const scheduleIdleAttract = () => {
        if (idleAttractTimerRef.current) {
            clearTimeout(idleAttractTimerRef.current);
            idleAttractTimerRef.current = null;
        }

        if (accessState !== "voting" || hasAccess || volumeWindow) {
            return;
        }

        idleAttractTimerRef.current = setTimeout(() => {
            setIsIdleAttractActive(true);
        }, IDLE_ATTRACT_DELAY_MS);
    };

    const registerUserActivity = () => {
        if (isIdleAttractActive) {
            setIsIdleAttractActive(false);
        }

        scheduleIdleAttract();
    };

    useEffect(() => {
        setIsIdleAttractActive(false);
        scheduleIdleAttract();

        return () => {
            if (idleAttractTimerRef.current) {
                clearTimeout(idleAttractTimerRef.current);
                idleAttractTimerRef.current = null;
            }
        };
    }, [accessState, hasAccess, volumeWindow]);

    useEffect(() => {
        if (!isIdleAttractActive) {
            Animated.timing(idleOverlayOpacity, {
                toValue: 0,
                duration: 280,
                useNativeDriver: true,
            }).start();
            return;
        }

        idleOverlayOpacity.setValue(0);
        Animated.timing(idleOverlayOpacity, {
            toValue: 1,
            duration: 420,
            useNativeDriver: true,
        }).start();

        idleGlowPulse.setValue(0);
        idleRippleAnims.forEach((r) => r.setValue(0));

        const BURST_STAGGER = 600;
        const RIPPLE_DURATION = 3200;
        const BURST_TOTAL = (idleRippleAnims.length - 1) * BURST_STAGGER + RIPPLE_DURATION;
        const PAUSE_BETWEEN = 30000;
        const FULL_CYCLE = BURST_TOTAL + PAUSE_BETWEEN;

        const glowLoop = Animated.loop(
            Animated.sequence([
                Animated.timing(idleGlowPulse, {
                    toValue: 1,
                    duration: 2600,
                    easing: Easing.inOut(Easing.quad),
                    useNativeDriver: true,
                }),
                Animated.timing(idleGlowPulse, {
                    toValue: 0,
                    duration: 2600,
                    easing: Easing.inOut(Easing.quad),
                    useNativeDriver: true,
                }),
                Animated.delay(PAUSE_BETWEEN - 5200),
            ])
        );

        // Master progress animation: 0 to 1 over the full cycle duration
        const masterProgress = new Animated.Value(0);
        const masterLoop = Animated.loop(
            Animated.timing(masterProgress, {
                toValue: 1,
                duration: FULL_CYCLE,
                easing: Easing.linear,
                useNativeDriver: false,
            })
        );

        // For each ripple, map master progress to its animation curve
        idleRippleAnims.forEach((ripple, index) => {
            const delayStart = (index * BURST_STAGGER) / FULL_CYCLE;
            const animEnd = ((index * BURST_STAGGER) + RIPPLE_DURATION) / FULL_CYCLE;

            masterProgress.addListener(({ value }) => {
                if (value >= delayStart && value <= animEnd) {
                    // Normalize to 0-1 within this ripple's animation window
                    const localProgress = (value - delayStart) / (animEnd - delayStart);
                    // Scale and fade curve
                    const scale = 0.08 + (localProgress * 1.57);
                    const opacity = localProgress < 0.22 ? localProgress / 0.22 * 0.42 : Math.max(0, 0.42 * (1 - localProgress));

                    ripple.setValue(localProgress);
                } else if (value > animEnd) {
                    ripple.setValue(0);
                }
            });
        });

        glowLoop.start();
        masterLoop.start();

        return () => {
            glowLoop.stop();
            masterLoop.stop();
            masterProgress.removeAllListeners();
        };
    }, [isIdleAttractActive, idleOverlayOpacity, idleGlowPulse, idleRippleAnims]);

    useEffect(() => {
        const animations = waveBars.map((bar, index) => {
            const phaseOffset = (index % 16) * 10;
            const highTarget = 0.85 + ((index * 11) % 15) / 100;
            const lowTarget = 0.08 + ((index * 7) % 18) / 100;

            return Animated.loop(
                Animated.sequence([
                    Animated.delay(phaseOffset),
                    Animated.timing(bar, {
                        toValue: Math.min(1, highTarget),
                        duration: 120 + ((index * 29) % 180),
                        useNativeDriver: true,
                    }),
                    Animated.timing(bar, {
                        toValue: Math.max(0.05, lowTarget),
                        duration: 130 + ((index * 23) % 170),
                        useNativeDriver: true,
                    }),
                ])
            );
        });

        animations.forEach((animation) => animation.start());

        return () => {
            animations.forEach((animation) => animation.stop());
        };
    }, [waveBars]);

    useEffect(() => {
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(topWinnerGlowAnim, {
                    toValue: 0.95,
                    duration: 1600,
                    useNativeDriver: true,
                }),
                Animated.timing(topWinnerGlowAnim, {
                    toValue: 0.3,
                    duration: 1600,
                    useNativeDriver: true,
                }),
            ])
        );

        loop.start();
        return () => loop.stop();
    }, [topWinnerGlowAnim]);

    useEffect(() => {
        const screenWidth = Dimensions.get("window").width;
        const sweepLoop = Animated.loop(
            Animated.sequence([
                Animated.delay(5000),
                Animated.timing(lightSweepTranslateX, {
                    toValue: screenWidth + 760,
                    duration: 2200,
                    easing: Easing.inOut(Easing.quad),
                    useNativeDriver: true,
                }),
                Animated.timing(lightSweepTranslateX, {
                    toValue: -760,
                    duration: 0,
                    useNativeDriver: true,
                }),
                Animated.delay(9000),
            ])
        );

        sweepLoop.start();
        return () => sweepLoop.stop();
    }, [lightSweepTranslateX]);

    if (!fontsLoaded) return null;

    const showOverlay = accessState === "scanning" || accessState === "manual" || accessState === "invalid";
    const needsPermission = showOverlay && !permission?.granted;
    const statusText = "";
    const sortedPlaylists = [...playlists].sort((a, b) => b.votes - a.votes);
    const idleRippleSize = Dimensions.get("window").width * 1.3;
    const idleScreenW = Dimensions.get("window").width;
    const idleScreenH = Dimensions.get("window").height;
    const idleBaseGlowOpacity = idleGlowPulse.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 0.06],
    });
    const memberEntries = Object.entries(memberRecords).sort((a, b) => b[1].scannedAt - a[1].scannedAt);
    const membersWithVotesRemaining = memberEntries.filter(([, record]) => !record.votedGenre || !record.votedVolume).length;
    const membersFullyUsed = memberEntries.length - membersWithVotesRemaining;
    const describeMemberVoteState = (record: MemberRecord) => {
        if (record.votedGenre && record.votedVolume) return "Complete (genre + volume used)";
        if (!record.votedGenre && !record.votedVolume) return "No votes used yet";
        if (record.votedGenre && !record.votedVolume) return "Waiting for volume vote";
        return "Waiting for genre vote";
    };
    const selectedMemberStatus = selectedMemberRecord
        ? `${selectedMemberRecord.votedGenre ? "Genre used" : "Genre available"} | ${selectedMemberRecord.votedVolume ? "Volume used" : "Volume available"}`
        : "No member selected.";

    return (
        <View
            style={styles.fullScreenContainer}
            onStartShouldSetResponderCapture={() => {
                registerUserActivity();
                return false;
            }}
        >
            {Platform.OS === "web" && (
                <style dangerouslySetInnerHTML={{ __html: `[data-playlist-scroll]::-webkit-scrollbar { display: none; }` }} />
            )}
            {/* Voting screen always rendered underneath as background */}
            <View style={styles.votingBg} pointerEvents={accessState === "voting" ? "auto" : "none"}>
                <ImageBackground
                    source={require("../../assets/images/main-bk.jpg")}
                    style={styles.votingBgImage}
                    resizeMode="cover"
                >
                    <Image
                        source={require("../../assets/images/jim.png")}
                        style={{
                            position: "absolute",
                            bottom: -390,
                            left: -140,
                            width: "36%",
                            height: "95%",
                            opacity: 0.17,
                        }}
                        resizeMode="contain"
                    />
                    <Image
                        source={require("../../assets/images/jim2.png")}
                        style={{
                            position: "absolute",
                            bottom: 0,
                            right: 0,
                            width: "36%",
                            height: "95%",
                            opacity: 0.17,
                        }}
                        resizeMode="contain"
                    />
                    <View pointerEvents="none" style={styles.lightSweepOverlay}>
                        <Animated.View
                            style={[
                                styles.lightSweepBeam,
                                { transform: [{ translateX: lightSweepTranslateX }, { rotate: "-18deg" }] },
                            ]}
                        />
                    </View>
                    <ScrollView
                        style={styles.votingScroll}
                        contentContainerStyle={styles.votingScreen}
                        contentInsetAdjustmentBehavior="never"
                        automaticallyAdjustContentInsets={false}
                        bounces={false}
                        alwaysBounceVertical={false}
                        overScrollMode="never"
                        showsVerticalScrollIndicator={false}
                    >
                        <TouchableOpacity
                            style={styles.votingTitleTouchable}
                            activeOpacity={1}
                        >
                            <Image
                                source={require("../../assets/images/the-soundtrack.png")}
                                style={styles.votingTitleImage}
                                resizeMode="contain"
                            />
                        </TouchableOpacity>
                        <View style={styles.votingLargeLineWrapper}>
                            <Image
                                source={require("../../assets/images/large-line.png")}
                                style={styles.votingLargeLineImage}
                                resizeMode="contain"
                            />
                        </View>
                        {statusText ? <Text style={styles.votingSubtitle}>{statusText}</Text> : null}

                        <View style={styles.infoColumns}>
                            <View style={styles.infoLeftColumn}>
                                <Image
                                    source={require("../../assets/images/how-it-works.png")}
                                    style={styles.howItWorksImage}
                                    resizeMode="cover"
                                />
                            </View>

                            <TouchableOpacity
                                activeOpacity={1}
                                onLongPress={showReconnectTemporarily}
                                delayLongPress={3000}
                                style={styles.spotifyLogoDivider}
                            >
                                <Image
                                    source={require("../../assets/images/spotifylogo.png")}
                                    style={{ width: "100%", height: "100%" }}
                                    resizeMode="contain"
                                />
                            </TouchableOpacity>

                            <View style={styles.infoRightColumn}>
                                {Platform.OS === "web" ? (
                                    <View
                                        style={[styles.playlistListScroll, { scrollbarWidth: "none", msOverflowStyle: "none" } as any]}
                                        {...({ "data-playlist-scroll": true } as any)}
                                    >
                                        {sortedPlaylists.map((playlist, index) => {
                                            const isFirst = index === 0;
                                            const TITLE_IMAGE_MAP: Record<string, any> = {
                                                "US Rap": require("../../assets/images/us-rap-title.png"),
                                                "D&B": require("../../assets/images/drum-and-bass.png"),
                                                "ROCK AND METAL": require("../../assets/images/rock-and-metal.png"),
                                                "TECH HOUSE": require("../../assets/images/tech-house-title.png"),
                                                "COUNTRY": require("../../assets/images/country-title.png"),
                                                "R&B": require("../../assets/images/rnb-title.png"),
                                            };
                                            const TITLE_STYLE_MAP: Record<string, any> = {
                                                "US Rap": styles.playlistTitleImageUsRap,
                                                "D&B": styles.playlistTitleImageDnb,
                                                "ROCK AND METAL": styles.playlistTitleImageRock,
                                                "TECH HOUSE": styles.playlistTitleImageTech,
                                                "COUNTRY": styles.playlistTitleImageCountry,
                                                "R&B": styles.playlistTitleImageRnb,
                                            };
                                            const titleImage = TITLE_IMAGE_MAP[playlist.name] ?? null;
                                            const titleStyle = TITLE_STYLE_MAP[playlist.name] ?? null;

                                            if (isFirst) {
                                                return (
                                                    <View key={playlist.id} style={styles.firstPlaylistSlot}>
                                                        <View style={styles.firstPlaylistCardBackground}>
                                                            {playlist.votes > 0 && (
                                                                <View style={styles.topWinnerGlowWrap} pointerEvents="none">
                                                                    <Animated.View
                                                                        pointerEvents="none"
                                                                        style={[styles.topWinnerGlowRing, { opacity: topWinnerGlowAnim }]}
                                                                    />
                                                                </View>
                                                            )}
                                                            <Image
                                                                source={require("../../assets/images/border-box-first.png")}
                                                                style={styles.firstPlaylistBorderImage}
                                                                resizeMode="stretch"
                                                            />
                                                            <View style={styles.firstPlaylistContent}>
                                                                <View style={styles.playlistRow}>
                                                                    <Image
                                                                        source={require("../../assets/images/logo.jpg")}
                                                                        style={styles.playlistLogo}
                                                                        resizeMode="cover"
                                                                    />
                                                                    <View style={styles.playlistInfo}>
                                                                        {titleImage ? (
                                                                            <Image source={titleImage} style={titleStyle} resizeMode="contain" />
                                                                        ) : (
                                                                            <Text style={styles.playlistTitleText}>{playlist.name}</Text>
                                                                        )}
                                                                    </View>
                                                                    <Image
                                                                        source={require("../../assets/images/topvote.png")}
                                                                        style={styles.topVoteIcon}
                                                                        resizeMode="contain"
                                                                    />
                                                                    <AnimatedVoteCounter votes={playlist.votes} style={styles.playlistVotesInline} />
                                                                    <AnimatedVoteButton style={styles.playlistVoteButton} onPress={() => handleVote(playlist.id)} />
                                                                </View>
                                                            </View>
                                                        </View>
                                                    </View>
                                                );
                                            }

                                            return (
                                                <ImageBackground
                                                    key={playlist.id}
                                                    source={require("../../assets/images/border-top-removed.png")}
                                                    style={styles.otherPlaylistCardBackground}
                                                    imageStyle={styles.playlistCardBorderImage}
                                                    resizeMode="stretch"
                                                >
                                                    <View style={styles.otherPlaylistContent}>
                                                        <View style={styles.playlistRow}>
                                                            <Image
                                                                source={require("../../assets/images/logo.jpg")}
                                                                style={styles.playlistLogo}
                                                                resizeMode="cover"
                                                            />
                                                            <View style={styles.playlistInfo}>
                                                                {titleImage ? (
                                                                    <Image source={titleImage} style={titleStyle} resizeMode="contain" />
                                                                ) : (
                                                                    <Text style={styles.playlistTitleText}>{playlist.name}</Text>
                                                                )}
                                                            </View>
                                                            <AnimatedVoteCounter votes={playlist.votes} style={styles.playlistVotesInline} />
                                                            <AnimatedVoteButton style={styles.playlistVoteButton} onPress={() => handleVote(playlist.id)} />
                                                        </View>
                                                    </View>
                                                </ImageBackground>
                                            );
                                        })}
                                    </View>
                                ) : (
                                    <ScrollView
                                        style={styles.playlistListScroll}
                                        showsVerticalScrollIndicator={false}
                                        bounces={false}
                                        nestedScrollEnabled
                                    >
                                        {sortedPlaylists.map((playlist, index) => {
                                            const isFirst = index === 0;
                                            const TITLE_IMAGE_MAP: Record<string, any> = {
                                                "US Rap": require("../../assets/images/us-rap-title.png"),
                                                "D&B": require("../../assets/images/drum-and-bass.png"),
                                                "ROCK AND METAL": require("../../assets/images/rock-and-metal.png"),
                                                "TECH HOUSE": require("../../assets/images/tech-house-title.png"),
                                                "COUNTRY": require("../../assets/images/country-title.png"),
                                                "R&B": require("../../assets/images/rnb-title.png"),
                                            };
                                            const TITLE_STYLE_MAP: Record<string, any> = {
                                                "US Rap": styles.playlistTitleImageUsRap,
                                                "D&B": styles.playlistTitleImageDnb,
                                                "ROCK AND METAL": styles.playlistTitleImageRock,
                                                "TECH HOUSE": styles.playlistTitleImageTech,
                                                "COUNTRY": styles.playlistTitleImageCountry,
                                                "R&B": styles.playlistTitleImageRnb,
                                            };
                                            const titleImage = TITLE_IMAGE_MAP[playlist.name] ?? null;
                                            const titleStyle = TITLE_STYLE_MAP[playlist.name] ?? null;

                                            if (isFirst) {
                                                return (
                                                    <View key={playlist.id} style={styles.firstPlaylistSlot}>
                                                        <View style={styles.firstPlaylistCardBackground}>
                                                            {playlist.votes > 0 && (
                                                                <View style={styles.topWinnerGlowWrap} pointerEvents="none">
                                                                    <Animated.View
                                                                        pointerEvents="none"
                                                                        style={[styles.topWinnerGlowRing, { opacity: topWinnerGlowAnim }]}
                                                                    />
                                                                </View>
                                                            )}
                                                            <Image
                                                                source={require("../../assets/images/border-box-first.png")}
                                                                style={styles.firstPlaylistBorderImage}
                                                                resizeMode="stretch"
                                                            />
                                                            <View style={styles.firstPlaylistContent}>
                                                                <View style={styles.playlistRow}>
                                                                    <Image
                                                                        source={require("../../assets/images/logo.jpg")}
                                                                        style={styles.playlistLogo}
                                                                        resizeMode="cover"
                                                                    />
                                                                    <View style={styles.playlistInfo}>
                                                                        {titleImage ? (
                                                                            <Image source={titleImage} style={titleStyle} resizeMode="contain" />
                                                                        ) : (
                                                                            <Text style={styles.playlistTitleText}>{playlist.name}</Text>
                                                                        )}
                                                                    </View>
                                                                    <Image
                                                                        source={require("../../assets/images/topvote.png")}
                                                                        style={styles.topVoteIcon}
                                                                        resizeMode="contain"
                                                                    />
                                                                    <AnimatedVoteCounter votes={playlist.votes} style={styles.playlistVotesInline} />
                                                                    <AnimatedVoteButton style={styles.playlistVoteButton} onPress={() => handleVote(playlist.id)} />
                                                                </View>
                                                            </View>
                                                        </View>
                                                    </View>
                                                );
                                            }

                                            return (
                                                <ImageBackground
                                                    key={playlist.id}
                                                    source={require("../../assets/images/border-top-removed.png")}
                                                    style={styles.otherPlaylistCardBackground}
                                                    imageStyle={styles.playlistCardBorderImage}
                                                    resizeMode="stretch"
                                                >
                                                    <View style={styles.otherPlaylistContent}>
                                                        <View style={styles.playlistRow}>
                                                            <Image
                                                                source={require("../../assets/images/logo.jpg")}
                                                                style={styles.playlistLogo}
                                                                resizeMode="cover"
                                                            />
                                                            <View style={styles.playlistInfo}>
                                                                {titleImage ? (
                                                                    <Image source={titleImage} style={titleStyle} resizeMode="contain" />
                                                                ) : (
                                                                    <Text style={styles.playlistTitleText}>{playlist.name}</Text>
                                                                )}
                                                            </View>
                                                            <AnimatedVoteCounter votes={playlist.votes} style={styles.playlistVotesInline} />
                                                            <AnimatedVoteButton style={styles.playlistVoteButton} onPress={() => handleVote(playlist.id)} />
                                                        </View>
                                                    </View>
                                                </ImageBackground>
                                            );
                                        })}
                                    </ScrollView>
                                )}
                                <ImageBackground
                                    source={require("../../assets/images/musicbox.png")}
                                    style={styles.soundTracksPlaceholder}
                                    imageStyle={styles.soundTracksPlaceholderImage}
                                    resizeMode="stretch"
                                >
                                    <View style={styles.currentTrackRow}>
                                        <View style={styles.currentTrackLeftContent}>
                                            <View style={styles.currentTrackArtContainer}>
                                                <View style={styles.currentTrackArtShadow} pointerEvents="none" />
                                                <View style={styles.currentTrackArtFrame} pointerEvents="none" />
                                                <View style={styles.currentTrackArtReflection} pointerEvents="none" />
                                                {prevTrackArtUrl && (
                                                    <Animated.Image
                                                        source={{ uri: prevTrackArtUrl }}
                                                        style={[styles.currentTrackArtImage, styles.currentTrackArtAbsolute, { opacity: artFadeAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]}
                                                        resizeMode="cover"
                                                    />
                                                )}
                                                {currentTrackArtUrl ? (
                                                    <Animated.Image
                                                        source={{ uri: currentTrackArtUrl }}
                                                        style={[styles.currentTrackArtImage, { opacity: artFadeAnim }]}
                                                        resizeMode="cover"
                                                    />
                                                ) : (
                                                    <Image
                                                        source={require("../../assets/images/logo.jpg")}
                                                        style={styles.currentTrackArtImage}
                                                        resizeMode="cover"
                                                    />
                                                )}
                                            </View>
                                            <View style={styles.currentTrackInfo}>
                                                <Image
                                                    source={require("../../assets/images/nowplaying.png")}
                                                    style={styles.nowPlayingImage}
                                                    resizeMode="contain"
                                                />
                                                <MarqueeText
                                                    text={currentTrackName || "NOW PLAYING"}
                                                    style={styles.currentTrackName}
                                                />
                                                <Text style={styles.currentTrackArtist} numberOfLines={1}>
                                                    {currentTrackArtist || "TDM GYM"}
                                                </Text>
                                                <View style={styles.progressBarContainer}>
                                                    <View style={styles.progressBarTrack}>
                                                        <Animated.View
                                                            style={[
                                                                styles.progressBarFill,
                                                                {
                                                                    width: progressFillAnim.interpolate({
                                                                        inputRange: [0, 1],
                                                                        outputRange: ["0%", "100%"],
                                                                    }),
                                                                    overflow: "hidden",
                                                                },
                                                            ]}
                                                        >
                                                            <Animated.View
                                                                style={{
                                                                    position: "absolute",
                                                                    top: 0,
                                                                    bottom: 0,
                                                                    width: 55,
                                                                    backgroundColor: "rgba(255,255,255,0.32)",
                                                                    transform: [{
                                                                        translateX: progressShimmerAnim.interpolate({
                                                                            inputRange: [0, 1],
                                                                            outputRange: [-60, 360],
                                                                        }),
                                                                    }],
                                                                }}
                                                            />
                                                        </Animated.View>
                                                    </View>
                                                    <View style={styles.progressTimeRow}>
                                                        <Text style={styles.progressTimeText}>{formatMs(trackProgressMs)}</Text>
                                                        <Text style={styles.progressTimeText}>{formatMs(trackDurationMs)}</Text>
                                                    </View>
                                                </View>
                                            </View>
                                        </View>
                                        <View style={styles.waveAndNextContainer}>
                                            <View style={styles.currentTrackWaveContainer}>
                                                {waveBars.map((scaleY, index) => (
                                                    <View key={`wave-slot-${index}`} style={styles.currentTrackWaveBarSlot}>
                                                        <Animated.View
                                                            style={[
                                                                styles.currentTrackWaveBar,
                                                                { height: 70 + ((index * 7) % 50) },
                                                                { transform: [{ scaleY }] },
                                                            ]}
                                                        />
                                                    </View>
                                                ))}
                                            </View>
                                        </View>
                                    </View>
                                    {nextTrackName ? (
                                        <View style={styles.nextTrackTextWrapper}>
                                            <Text style={styles.nextTrackText}>Up next: </Text>
                                            <View style={styles.nextTrackMarqueeWrapper}>
                                                <MarqueeText
                                                    text={`${nextTrackName} // ${nextTrackArtist}`}
                                                    style={styles.nextTrackText}
                                                />
                                            </View>
                                        </View>
                                    ) : null}
                                </ImageBackground>
                            </View>

                            <View style={styles.volumeBarContainer}>
                                <TouchableOpacity
                                    style={[styles.volumeButton, !volumeWindow && { opacity: 0.4 }]}
                                    onPress={() => {
                                        if (!volumeWindow) return;
                                        const next = Math.min(volumePercent + 1, 20);
                                        setVolumePercent(next);
                                        triggerVolumeGlow();
                                        if (spotifySession?.accessToken) {
                                            fetch(`https://api.spotify.com/v1/me/player/volume?volume_percent=${next * 5}`, {
                                                method: "PUT",
                                                headers: { Authorization: `Bearer ${spotifySession.accessToken}` },
                                            });
                                        }
                                        // Record volume vote
                                        if (activeMemberId && activeMemberId !== TEST_ID) {
                                            const records = { ...memberRecordsRef.current };
                                            if (records[activeMemberId]) {
                                                records[activeMemberId] = { ...records[activeMemberId], votedVolume: "up" };
                                                saveMemberRecords(records);
                                            }
                                        }
                                        // Disable volume
                                        setVolumeWindow(false);
                                        if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
                                        if (volumeWindowTimerRef.current) clearTimeout(volumeWindowTimerRef.current);
                                        if (volumeCountdownRef.current) clearInterval(volumeCountdownRef.current);
                                        // If they already voted genre, both done — stay on voting view
                                        const rec = activeMemberId ? memberRecordsRef.current[activeMemberId] : null;
                                        if (rec?.votedGenre) {
                                            setActiveMemberId(null);
                                            setVolumeCountdown(0);
                                        } else {
                                            // Start 10s countdown for genre vote
                                            setVolumeCountdown(10);
                                            if (volumeCountdownRef.current) clearInterval(volumeCountdownRef.current);
                                            volumeCountdownRef.current = setInterval(() => {
                                                setVolumeCountdown((prev) => {
                                                    if (prev <= 1) { if (volumeCountdownRef.current) clearInterval(volumeCountdownRef.current); return 0; }
                                                    return prev - 1;
                                                });
                                            }, 1000);
                                            if (volumeWindowTimerRef.current) clearTimeout(volumeWindowTimerRef.current);
                                            volumeWindowTimerRef.current = setTimeout(() => {
                                                setHasAccess(false);
                                                setActiveMemberId(null);
                                                if (volumeCountdownRef.current) clearInterval(volumeCountdownRef.current);
                                                setVolumeCountdown(0);
                                            }, 10000);
                                        }
                                    }}
                                >
                                    <Text style={styles.volumeButtonText}>+</Text>
                                </TouchableOpacity>
                                <View style={styles.volumeTrack}>
                                    <Animated.View
                                        pointerEvents="none"
                                        style={[
                                            styles.volumeGlow,
                                            {
                                                opacity: volumeGlowOpacity,
                                                transform: [{ scaleY: volumeGlowScale }, { scaleX: volumeGlowScale }],
                                            },
                                        ]}
                                    />
                                    <View style={[styles.volumeFill, { height: `${(volumePercent / 20) * 100}%` }]}>
                                        <View style={styles.volumeThumb} />
                                    </View>
                                </View>
                                <TouchableOpacity
                                    style={[styles.volumeButton, !volumeWindow && { opacity: 0.4 }]}
                                    onPress={() => {
                                        if (!volumeWindow) return;
                                        const next = Math.max(volumePercent - 1, 0);
                                        setVolumePercent(next);
                                        triggerVolumeGlow();
                                        if (spotifySession?.accessToken) {
                                            fetch(`https://api.spotify.com/v1/me/player/volume?volume_percent=${next * 5}`, {
                                                method: "PUT",
                                                headers: { Authorization: `Bearer ${spotifySession.accessToken}` },
                                            });
                                        }
                                        // Record volume vote
                                        if (activeMemberId && activeMemberId !== TEST_ID) {
                                            const records = { ...memberRecordsRef.current };
                                            if (records[activeMemberId]) {
                                                records[activeMemberId] = { ...records[activeMemberId], votedVolume: "down" };
                                                saveMemberRecords(records);
                                            }
                                        }
                                        // Disable volume
                                        setVolumeWindow(false);
                                        if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
                                        if (volumeWindowTimerRef.current) clearTimeout(volumeWindowTimerRef.current);
                                        if (volumeCountdownRef.current) clearInterval(volumeCountdownRef.current);
                                        // If they already voted genre, both done — stay on voting view
                                        const rec = activeMemberId ? memberRecordsRef.current[activeMemberId] : null;
                                        if (rec?.votedGenre) {
                                            setActiveMemberId(null);
                                            setVolumeCountdown(0);
                                        } else {
                                            // Start 10s countdown for genre vote
                                            setVolumeCountdown(10);
                                            if (volumeCountdownRef.current) clearInterval(volumeCountdownRef.current);
                                            volumeCountdownRef.current = setInterval(() => {
                                                setVolumeCountdown((prev) => {
                                                    if (prev <= 1) { if (volumeCountdownRef.current) clearInterval(volumeCountdownRef.current); return 0; }
                                                    return prev - 1;
                                                });
                                            }, 1000);
                                            if (volumeWindowTimerRef.current) clearTimeout(volumeWindowTimerRef.current);
                                            volumeWindowTimerRef.current = setTimeout(() => {
                                                setHasAccess(false);
                                                setActiveMemberId(null);
                                                if (volumeCountdownRef.current) clearInterval(volumeCountdownRef.current);
                                                setVolumeCountdown(0);
                                            }, 10000);
                                        }
                                    }}
                                >
                                    <Text style={styles.volumeButtonText}>−</Text>
                                </TouchableOpacity>
                            </View>
                        </View>

                    </ScrollView>

                    {showReconnectButton && (
                        <View style={styles.adminOverlay}>
                            <TouchableOpacity
                                style={styles.adminCloseButton}
                                onPress={() => setShowReconnectButton(false)}
                            >
                                <Text style={styles.adminCloseText}>✕</Text>
                            </TouchableOpacity>

                            <ScrollView style={styles.adminScroll} contentContainerStyle={styles.adminScrollContent}>
                                <Text style={styles.adminTitle}>KIOSK CONTROL PANEL</Text>

                                <View style={styles.adminSummaryRow}>
                                    <View style={styles.adminSummaryCard}>
                                        <Text style={styles.adminSummaryLabel}>Members in cooldown window</Text>
                                        <Text style={styles.adminSummaryValue}>{memberCount}</Text>
                                    </View>
                                    <View style={styles.adminSummaryCard}>
                                        <Text style={styles.adminSummaryLabel}>Still have votes left</Text>
                                        <Text style={styles.adminSummaryValue}>{membersWithVotesRemaining}</Text>
                                    </View>
                                    <View style={styles.adminSummaryCard}>
                                        <Text style={styles.adminSummaryLabel}>Completed both votes</Text>
                                        <Text style={styles.adminSummaryValue}>{membersFullyUsed}</Text>
                                    </View>
                                </View>

                                <View style={styles.adminRow}>
                                    <View style={[styles.adminSection, { flex: 1 }]}>
                                        <Text style={styles.adminSectionTitle}>Spotify health</Text>
                                        <Text style={styles.adminSectionHint}>If music controls stop working, reconnect here.</Text>
                                        <Text style={styles.adminStatusText}>{spotifyStatus}</Text>
                                        <TouchableOpacity
                                            style={styles.adminSpotifyBtn}
                                            onPress={() => { void handleSpotifyConnect(); }}
                                        >
                                            <Text style={styles.adminBtnText}>
                                                {spotifySession ? "Reconnect Spotify" : "Connect Spotify"}
                                            </Text>
                                        </TouchableOpacity>
                                    </View>

                                    <View style={[styles.adminSection, { flex: 1 }]}>
                                        <Text style={styles.adminSectionTitle}>Selected member access</Text>
                                        <Text style={styles.adminSectionHint}>
                                            {selectedMemberRecord ? `ID ${activeMemberId}` : "Scan a card to inspect a member."}
                                        </Text>
                                        <Text style={styles.adminStatusText}>{selectedMemberStatus}</Text>
                                        <Text style={styles.adminTimerText}>{memberCooldownCountdown}</Text>
                                        <TouchableOpacity
                                            style={styles.adminResetBtn}
                                            onPress={() => {
                                                if (!activeMemberId || activeMemberId === TEST_ID) {
                                                    return;
                                                }
                                                const records = { ...memberRecordsRef.current };
                                                delete records[activeMemberId];
                                                saveMemberRecords(records);
                                            }}
                                        >
                                            <Text style={styles.adminBtnText}>Reset selected member (allow fresh vote)</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>

                                <View style={styles.adminSection}>
                                    <Text style={styles.adminSectionTitle}>Member vote state ({memberCount})</Text>
                                    <Text style={styles.adminSectionHint}>Each row tells you exactly what the member can still do.</Text>
                                    {memberCount === 0 ? (
                                        <Text style={styles.adminHistoryEmpty}>No members scanned this session.</Text>
                                    ) : (
                                        <View style={styles.adminTable}>
                                            <View style={styles.adminTableHeader}>
                                                <Text style={[styles.adminTableCell, styles.adminTableHeaderCell, { flex: 1.1 }]}>Member ID</Text>
                                                <Text style={[styles.adminTableCell, styles.adminTableHeaderCell, { flex: 1.7 }]}>Current State</Text>
                                                <Text style={[styles.adminTableCell, styles.adminTableHeaderCell]}>Genre</Text>
                                                <Text style={[styles.adminTableCell, styles.adminTableHeaderCell]}>Volume</Text>
                                                <Text style={[styles.adminTableCell, styles.adminTableHeaderCell, { flex: 1.1 }]}>Cooldown</Text>
                                            </View>
                                            {memberEntries.map(([id, record], i) => {
                                                const remaining = Math.max(0, MEMBER_COOLDOWN_MS - (Date.now() - record.scannedAt));
                                                const mins = Math.floor(remaining / 60000);
                                                const secs = Math.floor((remaining % 60000) / 1000);
                                                return (
                                                    <View
                                                        key={id}
                                                        style={[
                                                            styles.adminTableRow,
                                                            i % 2 === 0 ? styles.adminTableRowEven : null,
                                                            activeMemberId === id ? styles.adminTableRowActive : null,
                                                        ]}
                                                    >
                                                        <Text style={[styles.adminTableCell, { flex: 1.1 }]}>{id}</Text>
                                                        <Text style={[styles.adminTableCell, { flex: 1.7 }]}>{describeMemberVoteState(record)}</Text>
                                                        <Text style={[styles.adminTableCell, { color: record.votedGenre ? "#4ADE80" : "rgba(255,255,255,0.65)" }]}>
                                                            {record.votedGenre ? "Done" : "Open"}
                                                        </Text>
                                                        <Text style={[styles.adminTableCell, { color: record.votedVolume ? "#4ADE80" : "rgba(255,255,255,0.65)" }]}>
                                                            {record.votedVolume ? "Done" : "Open"}
                                                        </Text>
                                                        <Text style={[styles.adminTableCell, { flex: 1.1, fontFamily: "monospace" }]}>
                                                            {remaining > 0 ? `${mins}:${secs.toString().padStart(2, "0")}` : "Expired"}
                                                        </Text>
                                                    </View>
                                                );
                                            })}
                                        </View>
                                    )}
                                </View>

                                <View style={styles.adminSection}>
                                    <Text style={styles.adminSectionTitle}>Vote snapshots (advanced)</Text>
                                    <Text style={styles.adminSectionHint}>Historical totals from reset snapshots for debugging only.</Text>
                                    {voteHistory.length === 0 ? (
                                        <Text style={styles.adminHistoryEmpty}>No resets yet.</Text>
                                    ) : (
                                        <View style={styles.adminTable}>
                                            <View style={styles.adminTableHeader}>
                                                <Text style={[styles.adminTableCell, styles.adminTableHeaderCell, { flex: 0.8 }]}>Reset Time</Text>
                                                {INITIAL_PLAYLISTS.map((p) => (
                                                    <Text key={p.id} style={[styles.adminTableCell, styles.adminTableHeaderCell]}>{p.name}</Text>
                                                ))}
                                            </View>
                                            {voteHistory.map((entry, i) => (
                                                <View key={`history-${i}`} style={[styles.adminTableRow, i % 2 === 0 ? styles.adminTableRowEven : null]}>
                                                    <Text style={[styles.adminTableCell, { flex: 0.8 }]}>{entry.time}</Text>
                                                    {INITIAL_PLAYLISTS.map((p) => {
                                                        const found = entry.votes.find((v) => v.name === p.name);
                                                        return <Text key={p.id} style={styles.adminTableCell}>{found?.votes ?? 0}</Text>;
                                                    })}
                                                </View>
                                            ))}
                                        </View>
                                    )}
                                </View>
                            </ScrollView>
                        </View>
                    )}

                    <Animated.View
                        pointerEvents="none"
                        style={[
                            styles.idleAttractOverlay,
                            {
                                opacity: idleOverlayOpacity,
                            },
                        ]}
                    >
                        {/* Base whole-screen breathing glow */}
                        <Animated.View
                            style={[
                                StyleSheet.absoluteFill,
                                {
                                    backgroundColor: "rgba(255,255,255,1)",
                                    opacity: idleBaseGlowOpacity,
                                },
                            ]}
                        />
                        {/* Staggered radial ripples rolling across the full screen */}
                        {idleRippleAnims.map((anim, i) => {
                            const ripplePositions = [
                                { cx: idleScreenW * 0.5, cy: idleScreenH * 0.5 },
                                { cx: idleScreenW * 0.18, cy: idleScreenH * 0.32 },
                                { cx: idleScreenW * 0.82, cy: idleScreenH * 0.68 },
                                { cx: idleScreenW * 0.78, cy: idleScreenH * 0.22 },
                                { cx: idleScreenW * 0.25, cy: idleScreenH * 0.78 },
                                { cx: idleScreenW * 0.6, cy: idleScreenH * 0.42 },
                            ];
                            const pos = ripplePositions[i];
                            return (
                                <Animated.View
                                    key={`ripple-${i}`}
                                    style={[
                                        styles.idleAttractRipple,
                                        {
                                            width: idleRippleSize,
                                            height: idleRippleSize,
                                            left: pos.cx - idleRippleSize / 2,
                                            top: pos.cy - idleRippleSize / 2,
                                            opacity: anim.interpolate({
                                                inputRange: [0, 0.22, 0.65, 1],
                                                outputRange: [0, 0.42, 0.2, 0],
                                            }),
                                            transform: [{
                                                scale: anim.interpolate({
                                                    inputRange: [0, 1],
                                                    outputRange: [0.08, 1.65],
                                                }),
                                            }],
                                        },
                                    ]}
                                />
                            );
                        })}
                    </Animated.View>

                    {/* Green semi-transparent overlay for scanning/manual/result screens */}
                    {showOverlay && (
                        <Animated.View style={[styles.greenOverlay, { opacity: overlayOpacity }]} pointerEvents="box-none">
                            <View style={styles.noiseLayer} pointerEvents="none">
                                <Image
                                    source={require("../../assets/images/noise.png")}
                                    style={styles.noiseTexture}
                                    resizeMode="repeat"
                                />
                            </View>
                            <View style={styles.modalBgOverlayFullScreen} pointerEvents="none">
                                <Image source={require("../../assets/images/main-bk.jpg")} style={styles.modalBgImage} resizeMode="cover" />
                            </View>
                            {needsPermission ? (
                                <View style={styles.overlayContent}>
                                    <View style={styles.iconCircle}>
                                        <Text style={styles.icon}>📷</Text>
                                    </View>
                                    <Text style={styles.title}>Camera Permission Required</Text>
                                    <Text style={styles.subtitle}>Camera access is needed to scan membership cards</Text>
                                    <TouchableOpacity style={styles.button} onPress={requestPermission}>
                                        <Text style={styles.buttonText}>Grant Permission</Text>
                                    </TouchableOpacity>
                                </View>
                            ) : accessState === "scanning" ? (
                                <View style={styles.fullScreenTransparent} pointerEvents="box-none">
                                    <CameraView ref={cameraRef} style={styles.fullScreenCamera} facing="front" mirror={false} />
                                    <View style={styles.modalFrame}>
                                        <View style={styles.modalCard}>
                                            <Image source={require("../../assets/images/scan-your-membership.png")} style={styles.scanTitleImage} resizeMode="contain" />
                                            <Image source={require("../../assets/images/loginimage.png")} style={styles.loginImage} resizeMode="contain" />
                                            <Image source={require("../../assets/images/hold your membership-card-infront-of-the-camera.png")} style={styles.scanSubtitleImage} resizeMode="contain" />
                                            <View style={styles.modalNoiseLayer} pointerEvents="none">
                                                <Image source={require("../../assets/images/noise.png")} style={styles.modalNoiseImage} resizeMode="repeat" />
                                            </View>
                                        </View>
                                        <View style={styles.modalBorderLayer} pointerEvents="none">
                                            <Image source={require("../../assets/images/border.png")} style={styles.modalBorderImage} resizeMode="stretch" />
                                        </View>
                                    </View>
                                </View>
                            ) : (
                                <View style={styles.fullScreenTransparent} pointerEvents="box-none">
                                    <View style={[styles.modalFrame, styles.modalFrameRejected]}>
                                        <View style={styles.modalCard}>
                                            <View style={styles.rejectedContent}>
                                                <Text style={styles.rejectedEmoji}>✋</Text>
                                                <Text style={styles.rejectedTitle}>ALREADY VOTED</Text>
                                                <Text style={styles.rejectedMessage}>You've already used your vote this session.</Text>
                                                {(() => {
                                                    const rec = rejectedMemberId ? memberRecordsRef.current[rejectedMemberId] : null;
                                                    if (!rec) return null;
                                                    const remaining = Math.max(0, MEMBER_COOLDOWN_MS - (Date.now() - rec.scannedAt));
                                                    const mins = Math.floor(remaining / 60000);
                                                    const secs = Math.floor((remaining % 60000) / 1000);
                                                    return (
                                                        <View style={styles.rejectedTimerBox}>
                                                            <Text style={styles.rejectedTimerLabel}>VOTE AGAIN IN</Text>
                                                            <Text style={styles.rejectedTimerValue}>{mins}:{secs.toString().padStart(2, "0")}</Text>
                                                        </View>
                                                    );
                                                })()}
                                            </View>
                                            <View style={styles.modalNoiseLayer} pointerEvents="none">
                                                <Image source={require("../../assets/images/noise.png")} style={styles.modalNoiseImage} resizeMode="repeat" />
                                            </View>
                                        </View>
                                        <View style={styles.modalBorderLayer} pointerEvents="none">
                                            <Image source={require("../../assets/images/border.png")} style={styles.modalBorderImage} resizeMode="stretch" />
                                        </View>
                                    </View>
                                </View>
                            )}
                        </Animated.View>
                    )}
                </ImageBackground>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    fullScreenContainer: {
        flex: 1,
        backgroundColor: "transparent",
        width: Dimensions.get("window").width,
        height: Dimensions.get("window").height,
        justifyContent: "center",
        alignItems: "center",
    },
    fullScreenTransparent: {
        ...StyleSheet.absoluteFill,
        backgroundColor: "transparent",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 10,
    },
    votingBg: {
        ...StyleSheet.absoluteFill,
        width: Dimensions.get("window").width,
        height: Dimensions.get("window").height,
        maxHeight: Dimensions.get("window").height,
        overflow: "hidden",
    },
    votingBgImage: {
        flex: 1,
        width: "100%",
        height: "100%",
        maxHeight: Dimensions.get("window").height,
    },
    lightSweepOverlay: {
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        overflow: "hidden",
    },
    lightSweepBeam: {
        position: "absolute",
        top: -180,
        left: 0,
        width: 260,
        height: Dimensions.get("window").height + 360,
        backgroundColor: "rgba(255,255,255,0.14)",
        shadowColor: "#ffffff",
        shadowOpacity: 0.18,
        shadowRadius: 60,
        shadowOffset: { width: 0, height: 0 },
    },
    votingScroll: {
        flex: 1,
        maxHeight: Dimensions.get("window").height,
    },
    idleAttractOverlay: {
        ...StyleSheet.absoluteFill,
        zIndex: 7,
        overflow: "hidden",
    },
    idleAttractRipple: {
        position: "absolute",
        borderRadius: 999,
        backgroundColor: "rgba(255, 255, 255, 0.22)",
        shadowColor: "#ffffff",
        shadowOpacity: 0.55,
        shadowRadius: 40,
        shadowOffset: { width: 0, height: 0 },
    },
    greenOverlay: {
        ...StyleSheet.absoluteFill,
        width: Dimensions.get("window").width,
        height: Dimensions.get("window").height,
        backgroundColor: "transparent",
        justifyContent: "center",
        alignItems: "center",
    },
    modalBgOverlayFullScreen: {
        ...StyleSheet.absoluteFill,
        zIndex: 1,
    },
    noiseLayer: {
        ...StyleSheet.absoluteFill,
    },
    noiseTexture: {
        position: "absolute",
        top: 0,
        left: 0,
        width: Dimensions.get("window").width,
        height: Dimensions.get("window").height,
        opacity: 0.06,
    },
    overlayContent: {
        alignItems: "center",
        gap: 16,
        width: "100%",
        paddingHorizontal: 24,
    },
    fullScreenCamera: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: "100%",
        height: "100%",
        zIndex: 1,
        opacity: 0,
    },
    overlayLandscape: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        justifyContent: "center",
        alignItems: "center",
        zIndex: 2,
    },
    modalCard: {
        backgroundColor: "rgba(65, 79, 63, 0.5)",
        borderRadius: 0,
        paddingVertical: 0,
        paddingHorizontal: 0,
        justifyContent: "center",
        alignItems: "center",
        width: "100%",
        height: "100%",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 24,
    },
    modalCardManual: {
        paddingHorizontal: 48,
    },
    modalFrame: {
        maxWidth: 480,
        width: "60%",
        height: 600,
        position: "relative",
        zIndex: 100,
    },
    modalFrameManual: {
        height: 350,
    },
    modalFrameRejected: {
        height: 350,
    },
    modalBgImage: {
        width: "100%",
        height: "100%",
        opacity: 0.9,
    },
    modalNoiseLayer: {
        ...StyleSheet.absoluteFill,
        zIndex: 10,
        overflow: "hidden",
    },
    modalNoiseImage: {
        width: "100%",
        height: "100%",
        opacity: 0.07,
    },
    modalBorderLayer: {
        ...StyleSheet.absoluteFill,
        zIndex: 20,
    },
    modalBorderImage: {
        width: "100%",
        height: "100%",
    },
    overlayTopLandscape: {
        alignItems: "center",
        gap: 8,
        marginTop: 24,
    },
    overlayBottomLandscape: {
        alignItems: "center",
        marginBottom: 24,
        gap: 16,
    },
    centeredContent: {
        alignItems: "center",
        gap: 16,
        width: "100%",
        paddingHorizontal: 24,
        flex: 1,
        justifyContent: "center",
    },
    iconCircle: {
        width: 120,
        height: 120,
        borderRadius: 60,
        backgroundColor: "#1a1a2e",
        justifyContent: "center",
        alignItems: "center",
    },
    icon: {
        fontSize: 50,
    },
    title: {
        fontSize: 28,
        fontWeight: "bold",
        color: "#fff",
    },
    subtitle: {
        fontSize: 16,
        color: "#aaa",
        textAlign: "center",
    },
    input: {
        width: "100%",
        backgroundColor: "#51624E",
        color: "#fff",
        fontSize: 16,
        textAlign: "left",
        paddingVertical: 13,
        paddingLeft: 10,
        paddingRight: 0,
        borderRadius: 0,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.24)",
        letterSpacing: 4,
    },
    manualInputLabel: {
        width: "100%",
        color: "#fff",
        textAlign: "left",
        fontSize: 16,
        marginBottom: 10,
    },
    button: {
        backgroundColor: "#007AFF",
        paddingVertical: 16,
        paddingHorizontal: 48,
        borderRadius: 12,
    },
    buttonText: {
        color: "#fff",
        fontSize: 20,
        fontWeight: "bold",
    },
    checkInButton: {
        width: "50%",
        alignSelf: "flex-start",
        marginTop: 20,
    },
    checkInButtonImage: {
        width: "100%",
        height: 44,
    },
    backButton: {
        marginTop: 20,
    },
    backButtonText: {
        color: "#007AFF",
        fontSize: 16,
    },
    manualBackButton: {
        position: "absolute",
        top: 15,
        left: 15,
        zIndex: 30,
        padding: 10,
    },
    backArrow: {
        width: 35,
        height: 35,
        borderRadius: 17,
        backgroundColor: "rgba(255, 255, 255, 0.2)",
        justifyContent: "center",
        alignItems: "center",
    },
    backArrowText: {
        color: "#fff",
        fontSize: 20,
        fontWeight: "700",
    },
    scanTitleImage: {
        width: "65%",
        height: 58,
        alignSelf: "center",
        marginBottom: 30,
    },
    loginImage: {
        width: "80%",
        height: 380,
        alignSelf: "center",
    },
    scanSubtitle: {
        fontSize: 18,
        color: "#ddd",
    },
    scanSubtitleImage: {
        width: "85%",
        height: 40,
        alignSelf: "center",
        marginTop: 30,
    },
    manualButton: {
        width: "50%",
        alignSelf: "center",
        marginTop: 30,
    },
    manualButtonImage: {
        width: "100%",
        height: 44,
    },
    deniedCircle: {
        backgroundColor: "#3d0a0a",
    },
    deniedTitle: {
        fontSize: 36,
        fontWeight: "bold",
        color: "#F44336",
    },
    deniedMessage: {
        fontSize: 18,
        color: "#ccc",
        textAlign: "center",
        lineHeight: 26,
    },
    rejectedContent: {
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 40,
        paddingHorizontal: 24,
        zIndex: 2,
    },
    rejectedEmoji: {
        fontSize: 48,
        marginBottom: 16,
    },
    rejectedTitle: {
        fontSize: 28,
        fontFamily: "Anton",
        color: "#fff",
        letterSpacing: 2,
        marginBottom: 8,
    },
    rejectedMessage: {
        fontSize: 14,
        color: "rgba(255,255,255,0.7)",
        textAlign: "center",
        marginBottom: 24,
    },
    rejectedTimerBox: {
        backgroundColor: "rgba(0,0,0,0.3)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.2)",
        borderRadius: 8,
        paddingVertical: 16,
        paddingHorizontal: 32,
        alignItems: "center",
    },
    rejectedTimerLabel: {
        fontSize: 11,
        color: "rgba(255,255,255,0.5)",
        letterSpacing: 1.5,
        fontWeight: "700",
        marginBottom: 4,
    },
    rejectedTimerValue: {
        fontSize: 32,
        fontFamily: "monospace",
        color: "#fff",
        fontWeight: "700",
    },
    votingScreen: {
        width: "100%",
        flexGrow: 1,
        paddingHorizontal: 15,
        paddingTop: 0,
        paddingBottom: 12,
        gap: 0,
    },
    votingTitle: {
        fontSize: 34,
        fontWeight: "bold",
        color: "#fff",
    },
    votingTitleTouchable: {
        width: Dimensions.get("window").width,
        marginLeft: -24,
        marginTop: 12,
        paddingHorizontal: 20,
        paddingTop: 10,
    },
    votingTitleImage: {
        width: "100%",
        height: 135,
    },
    votingLargeLineWrapper: {
        width: "100%",
        marginLeft: 0,
        paddingHorizontal: 0,
        marginTop: 10,
        marginBottom: 20,
        overflow: "hidden",
    },
    votingLargeLineImage: {
        width: "98.5%",
        aspectRatio: 2520 / 18,
        alignSelf: "center",
    },
    votingSubtitle: {
        fontSize: 16,
        color: "#aaa",
    },
    infoColumns: {
        width: "100%",
        flexDirection: "row",
        gap: 9,
        marginTop: 0,
        alignItems: "flex-start",
        position: "relative",
    },
    spotifyLogoDivider: {
        position: "absolute",
        left: "20%",
        top: "30%",
        width: 70,
        height: 70,
        marginLeft: -12,
        marginTop: -130,
        zIndex: 10,
    },
    infoLeftColumn: {
        width: "22%",
        alignSelf: "flex-start",
    },
    howItWorksImage: {
        width: "100%",
        height: 608,
        marginTop: -12,
    },
    infoRightColumn: {
        flex: 1,
        justifyContent: "flex-start",
        gap: 6,
    },
    soundTracksHeading: {
        color: "#fff",
        fontSize: 28,
        fontWeight: "700",
    },
    soundTracksPlaceholder: {
        width: "100%",
        height: 192,
        marginTop: 0,
        justifyContent: "center",
        overflow: "hidden",
    },
    soundTracksPlaceholderImage: {
        width: "100%",
        height: 192,
    },
    currentTrackRow: {
        width: "100%",
        height: "100%",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: 0,
        paddingHorizontal: 20,
        gap: 55,
    },
    currentTrackLeftContent: {
        flex: 1,
        height: "100%",
        flexDirection: "row",
        alignItems: "center",
        flexShrink: 0,
    },
    currentTrackArtContainer: {
        width: 160,
        height: 160,
        justifyContent: "center",
        overflow: "hidden",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.16)",
        backgroundColor: "rgba(255,255,255,0.03)",
        shadowColor: "#000",
        shadowOpacity: 0.26,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 10 },
        boxShadow: "0 10px 24px rgba(0,0,0,0.28)",
    },
    currentTrackArtShadow: {
        position: "absolute",
        left: 14,
        right: 14,
        bottom: -12,
        height: 20,
        backgroundColor: "rgba(0,0,0,0.22)",
        borderRadius: 999,
        transform: [{ scaleX: 0.9 }],
        zIndex: 0,
    },
    currentTrackArtFrame: {
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.14)",
        zIndex: 3,
    },
    currentTrackArtReflection: {
        position: "absolute",
        top: 10,
        left: 12,
        width: 34,
        height: 104,
        backgroundColor: "rgba(255,255,255,0.09)",
        transform: [{ rotate: "-12deg" }],
        zIndex: 2,
    },
    currentTrackArtImage: {
        width: 160,
        height: 160,
        zIndex: 1,
    },
    currentTrackArtAbsolute: {
        position: "absolute",
        top: 0,
        left: 0,
    },
    currentTrackInfo: {
        flex: 1,
        minWidth: 0,
        paddingLeft: 15,
        paddingRight: 0,
        justifyContent: "center",
        alignItems: "flex-start",
    },
    nowPlayingImage: {
        width: "40%",
        height: 42,
        marginTop: -15,
        marginLeft: 0,
        alignSelf: "flex-start",
    },
    currentTrackName: {
        color: "#4C5C4A",
        fontSize: 35,
        fontFamily: "Anton",
        width: "100%",
        textAlign: "left",
        alignSelf: "flex-start",
    },
    currentTrackArtist: {
        color: "#4C5C4A",
        fontSize: 14,
        fontFamily: "monospace",
        fontWeight: "400",
        marginTop: 4,
    },
    progressBarContainer: {
        width: "100%",
        marginTop: 18,
    },
    progressBarTrack: {
        width: "100%",
        height: 4,
        backgroundColor: "rgba(76, 92, 74, 0.3)",
        borderRadius: 2,
        overflow: "hidden",
    },
    progressBarFill: {
        height: "100%",
        backgroundColor: "#4C5C4A",
        borderRadius: 2,
    },
    progressTimeRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        marginTop: 4,
    },
    progressTimeText: {
        color: "#4C5C4A",
        fontSize: 11,
        fontFamily: "monospace",
    },
    waveAndNextContainer: {
        flexDirection: "column",
        alignItems: "flex-end",
        flexShrink: 0,
    },
    currentTrackWaveContainer: {
        width: 290,
        height: 96,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "flex-start",
        paddingRight: 0,
        overflow: "hidden",
        flexShrink: 0,
    },
    nextTrackTextWrapper: {
        position: "absolute",
        bottom: 13,
        right: 12,
        width: 280,
        flexDirection: "row",
        alignItems: "center",
    },
    nextTrackMarqueeWrapper: {
        flex: 1,
        overflow: "hidden",
    },
    nextTrackText: {
        color: "#4c5c4a",
        fontSize: 13,
        fontFamily: "monospace",
    },
    currentTrackWaveBarSlot: {
        width: 1.1,
        height: 120,
        marginRight: 2,
        justifyContent: "center",
        alignItems: "center",
    },
    currentTrackWaveBar: {
        width: 1.1,
        height: 120,
        borderRadius: 999,
        marginRight: 0,
        backgroundColor: "#4C5C4A",
    },
    spotifyButton: {
        alignSelf: "flex-start",
        backgroundColor: "#1DB954",
    },
    adminOverlay: {
        ...StyleSheet.absoluteFill,
        backgroundColor: "#000",
        zIndex: 200,
    },
    adminCloseButton: {
        position: "absolute",
        top: 24,
        right: 24,
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: "rgba(255,255,255,0.1)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.3)",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 210,
    },
    adminCloseText: {
        color: "#fff",
        fontSize: 18,
        fontWeight: "700",
    },
    adminScroll: {
        flex: 1,
        width: "100%",
    },
    adminScrollContent: {
        paddingTop: 40,
        paddingBottom: 40,
        paddingHorizontal: 32,
        alignItems: "stretch",
    },
    adminSummaryRow: {
        flexDirection: "row",
        gap: 12,
        marginBottom: 16,
    },
    adminSummaryCard: {
        flex: 1,
        backgroundColor: "rgba(255,255,255,0.06)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.12)",
        borderRadius: 10,
        paddingVertical: 12,
        paddingHorizontal: 12,
    },
    adminSummaryLabel: {
        color: "rgba(255,255,255,0.7)",
        fontSize: 12,
        marginBottom: 6,
    },
    adminSummaryValue: {
        color: "#fff",
        fontSize: 24,
        fontWeight: "800",
    },
    adminSummaryValueSmall: {
        color: "#fff",
        fontSize: 16,
        fontWeight: "700",
    },
    adminRow: {
        flexDirection: "row",
        gap: 16,
        width: "100%",
    },
    adminTitle: {
        color: "#fff",
        fontSize: 28,
        fontFamily: "Anton",
        letterSpacing: 2,
        marginBottom: 24,
        textAlign: "center",
    },
    adminSection: {
        width: "100%",
        backgroundColor: "rgba(255,255,255,0.05)",
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.1)",
        padding: 20,
        marginBottom: 20,
    },
    adminSectionTitle: {
        color: "#1DB954",
        fontSize: 13,
        fontWeight: "700",
        letterSpacing: 1.5,
        marginBottom: 6,
    },
    adminSectionHint: {
        color: "rgba(255,255,255,0.58)",
        fontSize: 12,
        marginBottom: 12,
    },
    adminStatusText: {
        color: "rgba(255,255,255,0.7)",
        fontSize: 14,
        marginBottom: 12,
    },
    adminSpotifyBtn: {
        backgroundColor: "#1DB954",
        paddingVertical: 12,
        paddingHorizontal: 24,
        borderRadius: 8,
        alignSelf: "flex-start",
    },
    adminBtnText: {
        color: "#fff",
        fontSize: 15,
        fontWeight: "700",
    },
    adminTimerText: {
        color: "#fff",
        fontSize: 20,
        fontFamily: "monospace",
        marginBottom: 12,
    },
    adminResetBtn: {
        backgroundColor: "#c0392b",
        paddingVertical: 12,
        paddingHorizontal: 24,
        borderRadius: 8,
        alignSelf: "flex-start",
    },
    adminHistoryEmpty: {
        color: "rgba(255,255,255,0.5)",
        fontSize: 14,
        fontStyle: "italic",
    },
    adminTable: {
        width: "100%",
        borderRadius: 8,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.1)",
    },
    adminTableHeader: {
        flexDirection: "row",
        backgroundColor: "rgba(255,255,255,0.1)",
        paddingVertical: 10,
        paddingHorizontal: 12,
    },
    adminTableHeaderCell: {
        fontWeight: "700",
        color: "#fff",
    },
    adminTableRow: {
        flexDirection: "row",
        paddingVertical: 10,
        paddingHorizontal: 12,
    },
    adminTableRowEven: {
        backgroundColor: "rgba(255,255,255,0.03)",
    },
    adminTableRowActive: {
        backgroundColor: "rgba(29,185,84,0.16)",
    },
    adminTableCell: {
        flex: 1,
        color: "rgba(255,255,255,0.8)",
        fontSize: 13,
    },
    preAccessTapLayer: {
        ...StyleSheet.absoluteFill,
        zIndex: 120,
    },
    playlistListScroll: {
        maxHeight: 400,
        overflow: "scroll",
    } as any,
    playlistList: {
        marginTop: 0,
    },
    firstPlaylistSlot: {
        width: "100%",
        height: 90,
        marginBottom: 0,
        overflow: "hidden",
        position: "relative",
    },
    topWinnerGlowWrap: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        justifyContent: "center",
        alignItems: "center",
        zIndex: 3,
    },
    topWinnerGlowRing: {
        position: "absolute",
        top: 1,
        left: 1,
        right: 1,
        bottom: 1,
        borderRadius: 4,
        borderWidth: 2,
        borderColor: "rgba(218, 196, 142, 1)",
        shadowColor: "#d5c08a",
        shadowOpacity: 0.95,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 0 },
        boxShadow: "0 0 22px rgba(213, 192, 138, 0.85)",
    },
    otherPlaylistsList: {
        marginTop: 0,
        gap: 0,
    },
    otherPlaylistCardBackground: {
        width: "100%",
        height: 90,
        position: "relative",
        borderRadius: 0,
        overflow: "hidden",
    },
    otherPlaylistContent: {
        paddingTop: 6,
        paddingBottom: 8,
        paddingHorizontal: 12,
        gap: 4,
        zIndex: 2,
    },
    playlistCard: {
        backgroundColor: "transparent",
        borderRadius: 0,
        paddingVertical: 10,
        paddingHorizontal: 12,
        gap: 4,
        position: "relative",
        overflow: "hidden",
    },
    firstPlaylistCard: {
        minHeight: 84,
        paddingVertical: 0,
        paddingHorizontal: 0,
    },
    firstPlaylistCardBackground: {
        width: "100%",
        height: 90,
        position: "relative",
        borderRadius: 0,
        overflow: "hidden",
    },
    firstPlaylistBorderImage: {
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: 90,
        zIndex: 1,
    },
    firstPlaylistContent: {
        paddingTop: 6,
        paddingBottom: 8,
        paddingHorizontal: 12,
        gap: 0,
        zIndex: 2,
    },
    playlistCardBorderImage: {
        borderRadius: 0,
    },
    playlistCardWinning: {
        borderColor: "#1DB954",
    },
    playlistTitle: {
        fontFamily: "Anton",
        fontSize: 24,
        color: "#fff",
    },
    playlistTitleImageUsRap: {
        width: 128,
        height: 24,
        alignSelf: "flex-start",
        marginLeft: 0,
    },
    playlistTitleImageDnb: {
        width: 195,
        height: 24,
        alignSelf: "flex-start",
        marginLeft: 0,
    },
    playlistTitleImageRock: {
        width: 128,
        height: 24,
        alignSelf: "flex-start",
        marginLeft: 0,
    },
    playlistTitleImageTech: {
        width: 126,
        height: 24,
        alignSelf: "flex-start",
        marginLeft: 0,
    },
    playlistTitleImageCountry: {
        width: 118,
        height: 24,
        alignSelf: "flex-start",
        marginLeft: 0,
    },
    playlistTitleImageRnb: {
        width: 163,
        height: 24,
        alignSelf: "flex-start",
        marginLeft: 0,
    },

    playlistTitleText: {
        color: "#fff",
        fontSize: 18,
        fontWeight: "700",
        letterSpacing: 1,
        alignSelf: "flex-start",
    },
    playlistVotes: {
        fontSize: 12,
        color: "#cbd5e1",
    },
    voteButton: {
        backgroundColor: "#fff",
        alignSelf: "flex-start",
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    playlistRow: {
        width: "100%",
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    playlistLogo: {
        width: 75,
        height: 75,
        borderRadius: 4,
    },
    playlistInfo: {
        flex: 1,
        justifyContent: "center",
        alignItems: "flex-start",
    },
    topVoteIcon: {
        width: 95,
        height: 50,
        marginRight: 6,
    },
    playlistVotesInline: {
        fontSize: 14,
        color: "#ffffff",
        marginRight: 10,
        backgroundColor: "rgba(76, 92, 74, 0.55)",
        borderWidth: 1,
        borderStyle: "dotted",
        borderColor: "#C4BB63",
        width: 100,
        paddingTop: 10,
        paddingBottom: 13,
        borderRadius: 4,
        textAlign: "center",
    },
    playlistVoteButton: {
        width: 110,
        height: 60,
        justifyContent: "center",
        alignItems: "center",
        borderRadius: 0,
        marginLeft: "auto",
        overflow: "hidden",
    },
    playlistVoteButtonGlass: {
        backgroundColor: "rgba(76, 92, 74, 0.04)",
        borderWidth: 1,
        borderColor: "rgba(132, 163, 122, 0.35)",
        shadowColor: "#7da876",
        shadowOpacity: 0.2,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 0 },
        boxShadow: "0 0 10px rgba(125,168,118,0.25)",
        overflow: "hidden",
    },
    playlistVoteButtonGlassGlow: {
        position: "absolute",
        inset: 0,
        backgroundColor: "rgba(125, 168, 118, 0.06)",
    },
    playlistVoteButtonGlassHighlight: {
        position: "absolute",
        top: 6,
        left: 10,
        right: 10,
        height: 14,
        backgroundColor: "rgba(255,255,255,0.10)",
        transform: [{ skewX: "-18deg" }],
    },
    playlistVoteButtonImage: {
        width: "100%",
        height: "100%",
    },
    voteButtonText: {
        color: "#fff",
        fontSize: 32,
        fontFamily: "monospace",
        fontWeight: "700",
    },
    resetButton: {
        marginTop: 12,
        alignSelf: "flex-start",
    },
    volumeBarContainer: {
        width: 50,
        alignItems: "center",
        justifyContent: "space-between",
        alignSelf: "stretch",
        paddingVertical: 12,
    },
    volumeButton: {
        width: 36,
        height: 36,
        borderRadius: 0,
        backgroundColor: "transparent",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.3)",
        alignItems: "center",
        justifyContent: "center",
    },
    volumeButtonText: {
        color: "#fff",
        fontSize: 18,
        fontWeight: "700",
        lineHeight: 20,
    },
    volumeTrack: {
        width: 6,
        flex: 1,
        marginVertical: 8,
        backgroundColor: "rgba(255,255,255,0.2)",
        borderRadius: 0,
        justifyContent: "flex-end",
        overflow: "visible",
    },
    volumeGlow: {
        position: "absolute",
        top: -14,
        right: -16,
        bottom: -14,
        left: -16,
        backgroundColor: "rgba(255,255,255,0.24)",
        borderRadius: 18,
    },
    volumeFill: {
        width: "100%",
        backgroundColor: "rgba(255,255,255,0.83)",
        borderRadius: 0,
        alignItems: "center",
    },
    volumeThumb: {
        width: 18,
        height: 18,
        backgroundColor: "#d9d9d9",
        position: "absolute",
        top: -9,
        alignSelf: "center",
    },
    volumeCountdownText: {
        color: "rgba(255,255,255,0.7)",
        fontSize: 11,
        fontWeight: "600",
        marginTop: 4,
    },
});