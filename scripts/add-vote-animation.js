const fs = require('fs');
let src = fs.readFileSync('src/app/index.tsx', 'utf8');

// 1. Add Pressable to RN imports
src = src.replace(
    '    TouchableOpacity,\n    UIManager,',
    '    Pressable,\n    TouchableOpacity,\n    UIManager,'
);

// 2. Insert AnimatedVoteButton component before export default function App()
const component = `function AnimatedVoteButton({ onPress, style }: { onPress: () => void; style: any }) {
    const scale = useRef(new Animated.Value(1)).current;

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
                style={{ width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' }}
            >
                <Image source={require('../../assets/images/votebutton.png')} style={styles.playlistVoteButtonImage} resizeMode='contain' />
            </Pressable>
        </Animated.View>
    );
}

`;

src = src.replace('export default function App() {', component + 'export default function App() {');

// 3. Replace all TouchableOpacity vote button usages with AnimatedVoteButton
src = src.replace(
    /<TouchableOpacity style={styles\.playlistVoteButton} onPress={\(\) => handleVote\(playlist\.id\)}>\s*<Image source={require\("\.\.\/\.\.\/assets\/images\/votebutton\.png"\)} style={styles\.playlistVoteButtonImage} resizeMode="contain" \/>\s*<\/TouchableOpacity>/g,
    '<AnimatedVoteButton style={styles.playlistVoteButton} onPress={() => handleVote(playlist.id)} />'
);

fs.writeFileSync('src/app/index.tsx', src);
const count = (src.match(/AnimatedVoteButton/g) || []).length;
console.log('Done. AnimatedVoteButton occurrences:', count);
