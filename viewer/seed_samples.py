"""Create three editable sample pages without overwriting existing work."""
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
PAGES = {}

def page(number, title, subtitle, width, height=1400):
    PAGES[number]={'schema_version':1,'pdf_page':number,'printed_page':str(number),'title':title,'subtitle':subtitle,'revision':0,'updated_at':None,'reference_size':[width,height],'image_url':f'/assets/p{number:04}.jpg','blocks':[]}

def block(number, kind, box, en, zh, font=18, notes=''):
    p=PAGES[number]; w,h=p['reference_size']; bbox=[round(box[0]/w,6),round(box[1]/h,6),round(box[2]/w,6),round(box[3]/h,6)]
    p['blocks'].append({'id':f'p{number:04}-b{len(p["blocks"])+1:03}','kind':kind,'source':{'text':en,'status':'corrected','languages':['en','ja'] if any('\u3040'<=c<='\u30ff' for c in en) else ['en'],'bbox':bbox},'translation':{'text':zh,'status':'draft'},'layout':{'bbox':bbox.copy(),'font_size':font,'line_height':1.55,'background':'#ffffff'},'notes':notes})

page(60,'Getting it Localized','正文 · 双图与图注',989)
block(60,'heading',(286,62,889,111),'Getting it Localized','让游戏走向本地化',39)
block(60,'paragraph',(286,136,888,235),"Before Undertale’s English release, Toby told me that he intended to release the game in Japanese sometime. He faced some big questions, though. How do you get a game translated and localized? And how do you ensure the final product is good if you don’t even know the language yourself?",'在 Undertale 英文版发售之前，Toby 告诉我，他打算日后推出日文版。不过，他面临着几个大问题：该怎样找人翻译并完成游戏的本地化？如果自己连那门语言都不懂，又该如何确保最终成品的质量？')
block(60,'paragraph',(286,249,888,324),"In this chapter, we’ll briefly look at how game developers approach localization, who Toby hired to localize Undertale, and how Undertale’s localization process worked on the inside.",'本章将简要介绍游戏开发者如何开展本地化、Toby 聘请了谁来为 Undertale 做本地化，以及这个过程在团队内部是如何运作的。')
block(60,'subheading',(286,350,888,377),'Who to Turn to','该找谁帮忙',23)
block(60,'paragraph',(286,392,888,467),"Let’s say you’re just like Toby and have finished developing your own game. It’s entirely in English, but you’d like to release it in Japan and other countries too. Where do you even start?",'假设你和 Toby 一样，刚刚完成自己的游戏。游戏完全是英文的，但你也想在日本和其他国家发行。该从哪里开始呢？')
block(60,'paragraph',(286,480,888,631),"The answer is pretty simple: translation and localization are no different from any other professional service, like plumbing, computer repair, or accounting. If you’re a big company, chances are you already have in-house staff members – or possibly an entire department – dedicated to handling such matters. Alternatively, you might already have contracts with outside agencies who can handle everything for you.",'答案很简单：翻译和本地化与水管维修、电脑维修、会计等专业服务并没有什么不同。如果你是一家大公司，很可能已经有内部员工，甚至整个部门，专门处理这类事务。或者，你可能已经与外部机构签有合同，可以将相关工作全部交给他们。')
block(60,'paragraph',(286,645,888,771),"But if you’re a small company, or just a single person, you’ll need to seek outside help. In this situation, your first thought might be, “Do I personally know anyone who can do this for me?” If the answer is no, then you might ask around for recommendations instead. And if that yields no leads, then there’s usually only one choice left: find someone on the Internet.",'但如果你是一家小公司，或者只有一个人，就需要寻求外部帮助。这时，你首先可能会想：“我认识的人里，有谁能帮我做这件事吗？”如果没有，就可以向周围的人打听推荐。如果仍无线索，通常就只剩下一条路：上网找人。')
block(60,'caption',(287,982,578,1021),'As a huge video game company, Nintendo has a dedicated department for localization','任天堂是一家大型游戏公司，设有专门的本地化部门。',15)
block(60,'caption',(604,982,890,1021),'“Bob Johnson” the single developer doesn’t have a dedicated localization department','“Bob Johnson”这位独立开发者没有专门的本地化部门。',15,'照片中的名字及文字不覆盖；此处只翻译书中图注。')
block(60,'paragraph',(286,1042,888,1143),"Unfortunately, searching for “hire a translator” or “hire a localizer” online will result in an avalanche of ads, sites, and companies begging for your business. Many of these services will offer to translate business documents, medical patents, video games, underwear packaging, and everything else you can think of.",'然而，在网上搜索“聘请译者”或“聘请本地化人员”，会迎来铺天盖地的广告、网站和招揽生意的公司。这些服务商中，许多都声称可以翻译商务文件、医疗专利、电子游戏、内衣包装，以及你能想到的其他各种内容。')
block(60,'paragraph',(286,1158,888,1258),"So, with a million different companies claiming to be experts at every type of translation and localization, how do you know who to pick? In Undertale’s case, Toby experienced it all: he asked friends, he looked around online, and he even received unsolicited offers from companies with in-house localization teams.",'面对无数自称精通各种翻译和本地化业务的公司，该怎么选呢？在 Undertale 的案例中，Toby 把这些途径都试过了：向朋友打听、上网寻找，甚至还有设有内部本地化团队的公司主动找上门来。')

page(140,'Translation Collision','侧栏 · 游戏截图 · 英日字形',978)
block(140,'heading',(285,87,889,111),'Translation Collision','翻译与碰撞判定',22,'标题结合本页 hitbox 语境的暂译。')
block(140,'aside',(119,130,265,235),'During this battle, the player must dodge bones that scroll by quickly and spell a funny phrase','在这场战斗中，玩家必须躲开快速掠过的骨头；这些骨头还拼成了一句有趣的话。',14)
block(140,'paragraph',(285,331,889,457),'In battle, Papyrus repeatedly and humorously states that he has a special attack that he’s prepared to use if need be. Eventually, he unleashes his special attack, which is flashy, strange, and funny all at once. In the English version of Undertale, this attack ends with the eight-character message “COOL DUDE” spelled out in bones. The player must then dodge this text as it quickly scrolls by.','战斗中，Papyrus 一再以诙谐的方式宣称，自己备有一招特殊攻击，必要时就会使出来。最后，他终于使出了这招既华丽、又古怪、还很好笑的攻击。在英文版 Undertale 中，攻击最后会出现用骨头拼出的八个字符：“COOL DUDE”。这行字会快速掠过，玩家必须躲开。')
block(140,'paragraph',(285,473,889,625),'Because this English bone text is somewhat difficult to read and scrolls by quickly, the translator felt it would benefit the gameplay experience to localize the bone text into Japanese. But as Toby noted, any changes to “COOL DUDE” would likely change the difficulty of avoiding the scrolling text. With this in mind, the translator looked for a phrase that could say roughly the same thing in Japanese using the exact same number of characters as the English message.','这些英文骨头字有些难读，移动又快，因此译者认为，将它们本地化成日文会改善游玩体验。但正如 Toby 所指出的，任何对“COOL DUDE”的改动，都可能改变躲避这行移动文字的难度。考虑到这一点，译者开始寻找一个日文短语：意思大致相同，字符数也必须与英文完全一致。')
block(140,'aside',(119,576,266,730),'Papyrus has a “COOL DUDE” attack and wears a “COOL DUDE” outfit at one point, but localizing the attack text into Japanese broke this connection','Papyrus 有一招“COOL DUDE”攻击，还曾穿过写着“COOL DUDE”的衣服。不过，把攻击文字本地化成日文后，两者之间的呼应就消失了。',14)
block(140,'paragraph',(285,637,889,790),'After some brainstorming for a replacement message, the translator chose the phrase イカした こうげき (ikashita kōgeki), which roughly means “cool attack” or “totally sweet attack”. This phrase was then given to the game art studio 256graph to transform into graphical form. 256graph not only created all-new Japanese bone text, but also ensured that its height and width closely matched the height and width of the original English bone text.','经过一番构思，译者选定了“イカした こうげき”（ikashita kōgeki），大意是“很酷的攻击”或“超棒的攻击”。随后，这个短语交给游戏美术工作室 256graph 制作成图像。256graph 不仅制作了全新的日文骨头字，还确保其高度和宽度与原英文骨头字尽量接近。',18,'日文与罗马字保留；本页截图和骨头字图像均保留原样。')
block(140,'aside',(119,807,265,954),'They definitely don’t teach hit box localization in textbooks or school, this is uncharted territory for almost everyone','教科书或学校里肯定不会教你如何本地化碰撞判定框；对几乎所有人来说，这都是陌生的领域。',14)
block(140,'aside',(119,974,265,1085),'The localized Japanese bone text closely matches the dimensions of the original English bone text','本地化后的日文骨头字，尺寸与原英文骨头字十分接近。',14)
block(140,'paragraph',(285,1140,889,1268),'All of this teamwork resulted in a Japanese phrase with the same number of characters as the English phrase, hitboxes that closely match the original game’s hitboxes, and all-new bone graphics that look just like the original English bone graphics. Even more impressive is that all of this work was done for one short message that stays on the screen for less than five seconds!','经过这番协作，最终的日文短语与英文拥有相同的字符数，碰撞判定框也与原版十分接近；全新制作的骨头字图像，看起来仍与原英文版本风格一致。更令人佩服的是，这一切工作，只是为了屏幕上一句停留不到五秒钟的短语！')

page(220,'Word Problems','英日对照 · 日文列表',989)
block(220,'heading',(287,86,889,111),'Word Problems','文字难题',22)
block(220,'aside',(123,128,268,234),'What DO you like most about Mettaton? Write your answer below for future generations to read:','你究竟最喜欢 Mettaton 的哪一点？请把答案写在下面，留给后人阅读：',14)
block(220,'paragraph',(287,277,889,328),'During battle, Mettaton gains a humanoid body and becomes Mettaton EX. He then stops and asks the player a question:','战斗中，Mettaton 获得了人形身体，变成 Mettaton EX。随后，他停下来问玩家一个问题：')
block(220,'quote',(324,343,888,370),'“What do you love most about Mettaton?”','“你最喜欢 Mettaton 的哪一点？”',19)
block(220,'paragraph',(287,380,889,534),'The player is then asked to type an essay on their computer keyboard that answers this question. Once the essay is finished – or if time runs out – Mettaton EX will scan the player’s essay for specific keywords and respond with appropriate dialogue. Toby originally designed this system to recognize English answers, so getting it to work properly in Japanese required all-new programming code and technical adjustments.','接下来，玩家需要用电脑键盘输入一篇短文来回答这个问题。写完之后，或者时间一到，Mettaton EX 就会扫描玩家的文章，寻找特定关键词，并给出对应的回应。Toby 最初把这套系统设计为识别英文答案，因此，要让它正常处理日文，就需要编写全新的代码并作出技术调整。')
block(220,'subheading',(287,550,889,577),'Keyboards','键盘',22)
block(220,'paragraph',(287,581,889,710),'First, because Undertale was originally designed for home computers, players could simply use their computer keyboard to type an essay answer. Unfortunately, home consoles rarely come with keyboards. To get around this hardware issue, the localization team added new code to Undertale’s programming to display on-screen keyboards compatible with game controllers.','首先，Undertale 最初是为家用电脑设计的，玩家可以直接用电脑键盘输入答案。然而，家用游戏机很少配备键盘。为了解决这一硬件问题，本地化团队为 Undertale 添加了新代码，显示可以用游戏手柄操作的屏幕键盘。')
block(220,'subheading',(287,729,889,756),'Japanese Input','日文输入',22)
block(220,'paragraph',(287,761,889,862),'The Japanese language includes three separate writing systems, which complicates the process of searching for keywords in the player’s essay. For example, the word bibō (“good looks”) can be written with a combination of all three systems, leading to multiple possible spellings:','日语包含三种书写系统，这使得在玩家文章中搜索关键词变得复杂。例如，bibō（“美貌”）可以用这三种书写系统组合写出，因而有多种可能的写法：')
block(220,'list',(306,875,870,981),'びぼう (all hiragana)\nビボウ (all katakana)\n美貌 (all kanji)\n美ぼう (kanji + hiragana)\n美ボウ (kanji + katakana)\nび貌 (hiragana + kanji)\nビ貌 (katakana + kanji)','びぼう（全平假名）\nビボウ（全片假名）\n美貌（全汉字）\n美ぼう（汉字＋平假名）\n美ボウ（汉字＋片假名）\nび貌（平假名＋汉字）\nビ貌（片假名＋汉字）',17,'保留日文拼写；原位预览采用两栏列表。')
block(220,'paragraph',(287,991,889,1065),'To simplify this technical problem, the localization team disabled kanji support. The team then added new programming that internally converts every katakana character to hiragana.','为简化这一技术问题，本地化团队禁用了汉字支持，随后加入新程序，在内部把每个片假名字符转换成平假名。')
block(220,'paragraph',(287,1080,889,1259),'This technical solution simplified matters greatly, but it had an unexpected flaw: the game’s core programming already uses the “Z” and “X” keys for other in-game functions. To get around this, the localization team made sure that no Japanese keywords required the “Z” or “X” keys. The team then added an on-screen message stating that “Z” and “X” are unavailable. Fortunately, these keys aren’t 100% vital for Japanese input to begin with – there are often multiple ways to type a single word in Japanese.','这项技术方案大大简化了问题，但也带来了一个意料之外的缺陷：游戏的核心程序已经把“Z”和“X”键用于其他游戏功能。为此，本地化团队确保所有日文关键词都不必用到“Z”或“X”键，并增加了提示，说明这两个键不可用。幸好，日文输入并非一定需要它们——同一个日语词往往有多种输入方式。')

# Keep the short introduction within its original two-line frame.
PAGES[220]['blocks'][2]['layout']['line_height']=1.4
for number, lines in {60:{1:1.25,4:1.15,8:1.3,9:1.3},140:{1:1.05,5:1.35},220:{1:1.1,4:1.35,6:1.2,8:1.2}}.items():
    for index, line in lines.items():
        PAGES[number]['blocks'][index-1]['layout']['line_height']=line
for number in [140,220]:
    heading=PAGES[number]['blocks'][0]['layout']
    heading['line_height']=1.2
    heading['bbox'][3]=heading['bbox'][1]+29/PAGES[number]['reference_size'][1]

# Reuse reviewed typography only when creating a missing sample; never overwrite edits.
calibration = json.loads((Path(__file__).parent/'sample-layouts.json').read_text(encoding='utf-8'))
for number, page_data in PAGES.items():
    reviewed = calibration[str(number)]
    page_data['reference_size'] = reviewed['reference_size']
    page_data['typography'] = reviewed['typography']
    for block_data in page_data['blocks']:
        record = reviewed['blocks'][block_data['id']]
        block_data['layout'] = record['layout']
        block_data['source']['mask_bbox'] = record['mask_bbox']
        block_data['calibration'] = record['calibration']

if __name__=='__main__':
    target=ROOT/'private/content/viewer'
    target.mkdir(parents=True,exist_ok=True)
    for n,p in PAGES.items():
        path=target/f'p{n:04}.json'
        if not path.exists():
            path.write_text(json.dumps(p,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
            print('Seeded',n,len(p['blocks']),'blocks')
        else: print('Preserved existing',path)
