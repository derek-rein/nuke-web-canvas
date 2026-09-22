export const SAMPLE_SCRIPT = `version 15.1 v1
Root {
 inputs 0
 name sample.nk
 first_frame 1001
 last_frame 1048
}
BackdropNode {
 inputs 0
 name BackdropNode1
 tile_color 0x2c3a44cc
 label plate
 note_font_size 22
 xpos -50
 ypos -90
 bdwidth 520
 bdheight 560
 z_order 0
}
Roto {
 inputs 0
 name Roto1
 xpos 300
 ypos 40
}
set Nroto [stack 0]
Read {
 inputs 0
 file /plates/bg.1001.exr
 name Read2
 xpos 180
 ypos -40
}
set Nbg [stack 0]
Read {
 inputs 0
 file /plates/hero.1001.exr
 name Read1
 xpos 0
 ypos -40
 postage_stamp true
}
Grade {
 name Grade1
 xpos 0
 ypos 50
}
set Ng [stack 0]
Dot {
 name Dot1
 xpos 34
 ypos 92
}
Blur {
 size 2
 name Blur1
 xpos 0
 ypos 130
}
Merge2 {
 inputs 2+1
 operation over
 name Merge1
 xpos 90
 ypos 230
}
Group {
 name grade_group
 xpos 90
 ypos 310
}
 Input {
  inputs 0
  name Input1
  xpos 0
  ypos -40
 }
 Grade {
  name Grade2
  xpos 0
  ypos 30
  gamma 0.8
 }
 Output {
  name Output1
  xpos 0
  ypos 100
 }
end_group
Saturation {
 disable true
 name Saturation1
 xpos 90
 ypos 390
}
Write {
 file /comp/hero.####.exr
 name Write1
 xpos 90
 ypos 460
}
Viewer {
 name Viewer1
 xpos 240
 ypos 460
}
clone $Ng {
 inputs 0
 name Grade1Clone
 xpos 300
 ypos 130
}
StickyNote {
 inputs 0
 name StickyNote1
 label "hero over bg\\nmask from roto"
 note_font_size 14
 xpos 300
 ypos 250
}
`;
