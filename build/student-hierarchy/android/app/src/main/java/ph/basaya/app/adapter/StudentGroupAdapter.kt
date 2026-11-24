package ph.basaya.app.adapter

import android.view.View
import android.view.ViewGroup
import android.view.Gravity
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.FrameLayout
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.RecyclerView
import com.google.android.material.card.MaterialCardView
import ph.basaya.app.R

data class StudentGroup(val id: String, val title: String, val count: String, val done: Int, val total: Int, val locked: Boolean, val reason: String)
class StudentGroupAdapter(private val groups: List<StudentGroup>, private val open: (StudentGroup) -> Unit) : RecyclerView.Adapter<StudentGroupAdapter.Holder>() {
    class Holder(val card: MaterialCardView) : RecyclerView.ViewHolder(card)
    override fun onCreateViewHolder(parent: ViewGroup, type: Int): Holder {
        val c = parent.context; val d = c.resources.displayMetrics.density
        return Holder(MaterialCardView(c).apply {
            layoutParams = RecyclerView.LayoutParams(-1, -2).apply { bottomMargin = (16*d).toInt() }
            radius = 12*d; cardElevation = 0f; strokeWidth = (d).toInt().coerceAtLeast(1)
            setCardBackgroundColor(ContextCompat.getColor(c,R.color.lesson_card_surface))
            strokeColor = ContextCompat.getColor(c,R.color.lesson_card_stroke)
            isClickable = true; isFocusable = true
        })
    }
    override fun getItemCount() = groups.size
    override fun onBindViewHolder(holder: Holder, position: Int) {
        val group = groups[position]; val card = holder.card; val c = card.context; val d = c.resources.displayMetrics.density
        card.removeAllViews()
        val frame = FrameLayout(c)
        val column = LinearLayout(c).apply { orientation = LinearLayout.VERTICAL; setPadding((20*d).toInt(),(22*d).toInt(),(54*d).toInt(),(22*d).toInt()) }
        fun text(value: String, size: Float, color: Int) = TextView(c).apply { text=value; textSize=size; setTextColor(ContextCompat.getColor(c,color)); setPadding(0,0,0,(10*d).toInt()) }
        column.addView(text(group.title,21f,R.color.home_ink).apply { typeface=android.graphics.Typeface.create("sans-serif-medium",0) })
        column.addView(text(group.count,14f,R.color.home_body))
        column.addView(text("${group.done}/${group.total} aralin na natapos",13f,R.color.home_body))
        column.addView(text(if(group.locked) group.reason else "Buksan  →",14f,R.color.home_ink))
        frame.addView(column)
        if(group.locked) frame.addView(View(c).apply { setBackgroundColor(ContextCompat.getColor(c,R.color.home_ink)); alpha=0.035f; importantForAccessibility=View.IMPORTANT_FOR_ACCESSIBILITY_NO },FrameLayout.LayoutParams(-1,-1))
        if(group.locked) frame.addView(android.widget.ImageView(c).apply {
            setImageResource(R.drawable.ic_lock_small); setColorFilter(ContextCompat.getColor(c,R.color.home_ink)); importantForAccessibility=View.IMPORTANT_FOR_ACCESSIBILITY_NO
        },FrameLayout.LayoutParams((26*d).toInt(),(26*d).toInt(),Gravity.TOP or Gravity.END).apply { topMargin=(22*d).toInt();rightMargin=(18*d).toInt() })
        card.addView(frame); card.contentDescription = group.title + ". " + group.count + ". " + if(group.locked) group.reason else "Buksan"
        card.setOnClickListener { open(group) }
    }
}
